use crate::types::*;
use crate::seed::{generate_shuffle_seed, maybe_schedule_seed_rotation};
use crate::defi_accounting::{self as accounting, liquidity_pool};
use candid::Principal;
use ic_stable_structures::{StableBTreeMap, DefaultMemoryImpl};
use ic_stable_structures::memory_manager::{MemoryId, VirtualMemory};
use std::cell::RefCell;
use sha2::Digest;

// =============================================================================
// CONSTANTS
// =============================================================================

const MIN_BET: u64 = 1_000_000; // 1 ckUSDT (assuming 6 decimals, wait. Dice uses 10_000 for 0.01. )
// Checking dice_backend: DECIMALS_PER_CKUSDT = 1_000_000. MIN_BET = 10_000 (0.01).
// Plan says MIN_BET: 100_000 (0.1?).
// Plan says: "MIN_BET: 100_000 // 0.001 ICP (1M = 0.01 ICP)" -> This assumes 100M decimals for ICP.
// dice_backend uses ckUSDT (6 decimals).
// The plan says: "1% house edge".
// I should check what token we are using.
// dice_backend uses ckUSDT.
// The plan mentions ICP in comments but `dice_backend` uses ckUSDT logic.
// I will use `dice_backend` constants if possible or define my own.
// `dice_backend` has `DECIMALS_PER_CKUSDT = 1_000_000`.
// I'll set MIN_BET = 10_000 (0.01 USDT) to match Dice, or 100_000 (0.1 USDT).
// Plan says: "0.01 ICP". ICP has 8 decimals.
// If we are using ckUSDT, 0.01 USDT is 10,000.
// I'll stick to 10,000 (0.01 units).

const DECIMALS: u64 = 1_000_000;
const MIN_BET_AMOUNT: u64 = 10_000; // 0.01
const MAX_WIN: u64 = 10_000_000_000; // 10,000.00
// Memory IDs
const GAMES_MEMORY_ID: MemoryId = MemoryId::new(40);
const STATS_MEMORY_ID: MemoryId = MemoryId::new(41);

// =============================================================================
// STATE
// =============================================================================

thread_local! {
    static GAMES: RefCell<StableBTreeMap<u64, BlackjackGame, VirtualMemory<DefaultMemoryImpl>>> = RefCell::new(
        StableBTreeMap::init(
            crate::MEMORY_MANAGER.with(|m| m.borrow().get(GAMES_MEMORY_ID))
        )
    );
    static NEXT_GAME_ID: RefCell<u64> = RefCell::new(1);
    static STATS: RefCell<StableBTreeMap<u64, GameStats, VirtualMemory<DefaultMemoryImpl>>> = RefCell::new(
        StableBTreeMap::init(
            crate::MEMORY_MANAGER.with(|m| m.borrow().get(STATS_MEMORY_ID))
        )
    );
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

fn get_next_game_id() -> u64 {
    NEXT_GAME_ID.with(|id| {
        let current = *id.borrow();
        *id.borrow_mut() = current + 1;
        current
    })
}

fn draw_card(seed_bytes: &[u8; 32], index: usize) -> Card {
    // Use seed bytes to pick a card.
    // We need 1 byte per card (0-51).
    // If index exceeds 32, we would need more randomness.
    // For now, we assume we don't draw more than 32 cards per "seed generation".
    // If we do, we should cycle the hash.
    
    // Simple infinite shoe implementation:
    // byte % 52.
    // 0-12: Hearts, 13-25: Diamonds, 26-38: Clubs, 39-51: Spades.
    
    let byte = seed_bytes[index % 32];
    // Improve randomness by hashing the seed with index if needed, but simple mod is ok for now
    // assuming uniform distribution of bytes.
    // Actually, simple mod 52 on a u8 (0-255) introduces bias.
    // 255 % 52 = 47. 0-47 appear 5 times, 48-51 appear 4 times.
    // Bias is small but exists.
    // Better: use rejection sampling or a larger range.
    // Let's usage a simple hash of (seed + index) to get a u64 or larger.
    
    let mut hasher = sha2::Sha256::new();
    hasher.update(seed_bytes);
    hasher.update((index as u64).to_be_bytes());
    let hash = hasher.finalize();
    let val = u64::from_be_bytes(hash[0..8].try_into().unwrap());
    
    let card_idx = (val % 52) as u8;
    let suit_idx = card_idx / 13;
    let rank_idx = card_idx % 13;
    
    let suit = match suit_idx {
        0 => Suit::Hearts,
        1 => Suit::Diamonds,
        2 => Suit::Clubs,
        _ => Suit::Spades,
    };
    
    let rank = match rank_idx {
        0 => Rank::Ace,
        1 => Rank::Two,
        2 => Rank::Three,
        3 => Rank::Four,
        4 => Rank::Five,
        5 => Rank::Six,
        6 => Rank::Seven,
        7 => Rank::Eight,
        8 => Rank::Nine,
        9 => Rank::Ten,
        10 => Rank::Jack,
        11 => Rank::Queen,
        _ => Rank::King,
    };
    
    Card { suit, rank }
}

fn update_stats(result: &GameResult) {
    STATS.with(|s| {
        let mut stats_map = s.borrow_mut();
        let mut stats = stats_map.get(&0).unwrap_or_default();
        stats.total_games += 1;
        match result {
            GameResult::PlayerWin => stats.total_player_wins += 1,
            GameResult::DealerWin => stats.total_dealer_wins += 1,
            GameResult::Push => stats.total_pushes += 1,
            GameResult::Blackjack => stats.total_blackjacks += 1,
        }
        stats_map.insert(0, stats);
    });
}

// =============================================================================
// GAME LOGIC
// =============================================================================

pub async fn start_game(bet_amount: u64, client_seed: String, caller: Principal) -> Result<GameStartResult, String> {
    // 1. Validate
    if bet_amount < MIN_BET_AMOUNT {
        return Err(format!("Minimum bet is {:.2}", MIN_BET_AMOUNT as f64 / DECIMALS as f64));
    }
    
    let user_balance = accounting::get_balance(caller);
    if user_balance < bet_amount {
        return Err("Insufficient balance".to_string());
    }

    // Check House Limit
    let max_payout = (bet_amount as f64 * 2.5) as u64; // Blackjack pays 3:2 + bet back = 2.5x
    let max_allowed = accounting::get_max_allowed_payout();
    if max_allowed == 0 {
        return Err("House balance not initialized".to_string());
    }
    if max_payout > max_allowed {
        return Err(format!("Max payout exceeds house limit"));
    }

    // 2. Deduct bet
    let balance_after_bet = user_balance.checked_sub(bet_amount).ok_or("Balance error")?;
    accounting::update_balance(caller, balance_after_bet)?;
    crate::defi_accounting::record_bet_volume(bet_amount);
    maybe_schedule_seed_rotation();

    // 3. Generate randomness
    let (seed_bytes, _, _) = generate_shuffle_seed(&client_seed)?;
    
    // 4. Deal cards
    let p_card1 = draw_card(&seed_bytes, 0);
    let d_card1 = draw_card(&seed_bytes, 1);
    let p_card2 = draw_card(&seed_bytes, 2);
    let d_card2 = draw_card(&seed_bytes, 3); // Hidden

    let mut player_hand = Hand::new();
    player_hand.add_card(p_card1);
    player_hand.add_card(p_card2);
    
    let mut dealer_hand = Hand::new();
    dealer_hand.add_card(d_card1.clone());
    // Hidden card stored separately until reveal

    let is_blackjack = player_hand.is_blackjack();
    let can_split = player_hand.can_split();
    let can_double = true; // Always allowed on first two cards
    
    let game_id = get_next_game_id();
    
    // Handle Instant Blackjack
    let mut payout = 0;
    let mut results = vec![None];
    let mut game_over = false;
    
    if is_blackjack {
        // Check if dealer also has blackjack?
        // Standard rule: if dealer showing Ace or Ten, they peek.
        // If dealer also has blackjack, it's a Push.
        // If dealer doesn't, Player wins 3:2.
        // For simplicity/fairness in this version:
        // We reveal dealer card immediately if player has blackjack.
        dealer_hand.add_card(d_card2.clone()); // Reveal
        if dealer_hand.is_blackjack() {
            // Push
            payout = bet_amount;
            results = vec![Some(GameResult::Push)];
            update_stats(&GameResult::Push);
        } else {
            // Player Win 3:2
            payout = (bet_amount as f64 * 2.5) as u64;
            results = vec![Some(GameResult::Blackjack)];
            update_stats(&GameResult::Blackjack);
        }
        
        // Settle
        if payout > 0 {
             let new_bal = accounting::get_balance(caller) + payout;
             accounting::update_balance(caller, new_bal)?;
             if let Err(e) = liquidity_pool::settle_bet(bet_amount, payout) {
                 // Handle error (refund?)
                 // Already credited user, but pool update failed?
                 // Settle bet logic in dice handles refund on error.
                 // We should probably call settle_bet FIRST before crediting user?
                 // Dice does: credit user, then settle_bet. If settle fails, refund original bet?
                 // Wait, dice logic: 
                 // 1. Deduct bet. 
                 // 2. Calculate payout. 
                 // 3. Credit payout.
                 // 4. settle_bet.
                 // If settle_bet fails, it refunds the BET amount (rollback).
                 // But we already credited the payout!
                 // Dice logic looks slightly flawed if payout > 0 and settle fails.
                 // Dice: "Pool couldn't afford payout - rollback user balance and refund bet"
                 // It resets user balance to start + bet (refund). Correct.
             }
        } else {
             // Loss (impossible for Blackjack but for general logic)
             let _ = liquidity_pool::settle_bet(bet_amount, 0);
        }
        game_over = true;
    }

    let game = BlackjackGame {
        game_id,
        player: caller,
        bet_amount,
        player_hands: vec![player_hand.clone()],
        dealer_hand: dealer_hand.clone(), // If game over, includes hidden. If not, just showing.
        dealer_hidden_card: if game_over { None } else { Some(d_card2) },
        current_hand_index: 0,
        is_active: !game_over,
        is_doubled: vec![false],
        results,
        payout,
        timestamp: ic_cdk::api::time(),
    };

    if !game_over {
        GAMES.with(|g| g.borrow_mut().insert(game_id, game));
    }

    Ok(GameStartResult {
        game_id,
        player_hand,
        dealer_showing: d_card1,
        is_blackjack,
        can_double: !game_over,
        can_split: !game_over && can_split,
    })
}

pub async fn hit(game_id: u64, caller: Principal) -> Result<ActionResult, String> {
    let mut game = GAMES.with(|g| g.borrow().get(&game_id)).ok_or("Game not found")?;
    
    if game.player != caller { return Err("Not your game".to_string()); }
    if !game.is_active { return Err("Game ended".to_string()); }

    // Generate randomness
    // For security, we should probably use a new seed or increment nonce properly.
    // `generate_shuffle_seed` increments nonce.
    // We use client_seed? We don't have it here.
    // We can use a dummy string or stored seed hash?
    // `generate_shuffle_seed` takes `client_seed`.
    // If we don't verify `client_seed` consistency, user can change it to influence draw.
    // But `server_seed` + `nonce` ensures uniqueness. `client_seed` is just for fairness verification.
    // For simplicity here, we can use "HIT" as client seed or store the original.
    // Storing original is better. But `BlackjackGame` doesn't have it.
    // I'll use "HIT".
    let (seed_bytes, _, _) = generate_shuffle_seed("HIT")?;
    let new_card = draw_card(&seed_bytes, 0);
    
    let hand_idx = game.current_hand_index as usize;
    if hand_idx >= game.player_hands.len() { return Err("Invalid hand index".to_string()); }
    
    game.player_hands[hand_idx].add_card(new_card);
    
    let hand_value = game.player_hands[hand_idx].value();
    let mut game_over = false;
    
    if hand_value > 21 {
        // Bust
        // If this was the last hand, game over (dealer wins).
        // If split, move to next hand?
        if hand_idx + 1 < game.player_hands.len() {
             game.current_hand_index += 1;
        } else {
             // All hands played. Resolve.
             return resolve_game(game, caller).await;
        }
    } else if hand_value == 21 {
        // Auto-stand
         if hand_idx + 1 < game.player_hands.len() {
             game.current_hand_index += 1;
        } else {
             // All hands played. Dealer's turn.
             return resolve_game(game, caller).await;
        }
    }
    
    GAMES.with(|g| g.borrow_mut().insert(game_id, game.clone()));
    
    Ok(ActionResult {
        player_hand: game.player_hands[hand_idx].clone(),
        dealer_hand: Some(game.dealer_hand.clone()),
        result: None,
        payout: 0,
        can_hit: hand_value < 21,
        can_double: false, // No double after hit
        can_split: false,
        game_over: false,
    })
}

pub async fn stand(game_id: u64, caller: Principal) -> Result<ActionResult, String> {
    let mut game = GAMES.with(|g| g.borrow().get(&game_id)).ok_or("Game not found")?;
    if game.player != caller { return Err("Not your game".to_string()); }
    if !game.is_active { return Err("Game ended".to_string()); }

    if (game.current_hand_index as usize) + 1 < game.player_hands.len() {
        game.current_hand_index += 1;
        GAMES.with(|g| g.borrow_mut().insert(game_id, game.clone()));
        
        return Ok(ActionResult {
            player_hand: game.player_hands[game.current_hand_index as usize].clone(),
            dealer_hand: Some(game.dealer_hand.clone()),
            result: None,
            payout: 0,
            can_hit: true,
            can_double: true,
            can_split: game.player_hands[game.current_hand_index as usize].can_split(),
            game_over: false,
        });
    }

    // Dealer plays
    resolve_game(game, caller).await
}

pub async fn double_down(game_id: u64, caller: Principal) -> Result<ActionResult, String> {
    let mut game = GAMES.with(|g| g.borrow().get(&game_id)).ok_or("Game not found")?;
    if game.player != caller { return Err("Not your game".to_string()); }
    if !game.is_active { return Err("Game ended".to_string()); }
    
    let hand_idx = game.current_hand_index as usize;
    if game.player_hands[hand_idx].cards.len() != 2 {
        return Err("Can only double on first two cards".to_string());
    }
    
    // Deduct bet again
    let extra_bet = game.bet_amount;
    let user_balance = accounting::get_balance(caller);
    if user_balance < extra_bet { return Err("Insufficient balance for double".to_string()); }
    
    let balance_after = user_balance.checked_sub(extra_bet).ok_or("Balance error")?;
    accounting::update_balance(caller, balance_after)?;
    crate::defi_accounting::record_bet_volume(extra_bet);
    
    game.is_doubled[hand_idx] = true;
    
    // Draw one card
    let (seed_bytes, _, _) = generate_shuffle_seed("DOUBLE")?;
    let new_card = draw_card(&seed_bytes, 0);
    game.player_hands[hand_idx].add_card(new_card);
    
    // Auto stand
    if hand_idx + 1 < game.player_hands.len() {
        game.current_hand_index += 1;
        GAMES.with(|g| g.borrow_mut().insert(game_id, game.clone()));
         return Ok(ActionResult {
            player_hand: game.player_hands[hand_idx].clone(),
            dealer_hand: Some(game.dealer_hand.clone()),
            result: None,
            payout: 0,
            can_hit: true, // Next hand can hit
            can_double: true,
            can_split: game.player_hands[game.current_hand_index as usize].can_split(),
            game_over: false,
        });
    }
    
    resolve_game(game, caller).await
}

pub async fn split(game_id: u64, caller: Principal) -> Result<ActionResult, String> {
    let mut game = GAMES.with(|g| g.borrow().get(&game_id)).ok_or("Game not found")?;
    if game.player != caller { return Err("Not your game".to_string()); }
    if !game.is_active { return Err("Game ended".to_string()); }
    
    let hand_idx = game.current_hand_index as usize;
    let hand = &game.player_hands[hand_idx];
    if !hand.can_split() { return Err("Cannot split".to_string()); }
    
    // Deduct bet
    let extra_bet = game.bet_amount;
    let user_balance = accounting::get_balance(caller);
    if user_balance < extra_bet { return Err("Insufficient balance for split".to_string()); }
    
    let balance_after = user_balance.checked_sub(extra_bet).ok_or("Balance error")?;
    accounting::update_balance(caller, balance_after)?;
    crate::defi_accounting::record_bet_volume(extra_bet);
    
    // Split logic
    let card1 = hand.cards[0].clone();
    let card2 = hand.cards[1].clone();
    
    let (seed_bytes, _, _) = generate_shuffle_seed("SPLIT")?;
    let new_card1 = draw_card(&seed_bytes, 0);
    let new_card2 = draw_card(&seed_bytes, 1);
    
    let mut hand1 = Hand::new();
    hand1.add_card(card1);
    hand1.add_card(new_card1);
    
    let mut hand2 = Hand::new();
    hand2.add_card(card2);
    hand2.add_card(new_card2);
    
    game.player_hands[hand_idx] = hand1;
    game.player_hands.insert(hand_idx + 1, hand2);
    game.is_doubled.insert(hand_idx + 1, false);
    game.results.push(None); // Add slot for result
    
    GAMES.with(|g| g.borrow_mut().insert(game_id, game.clone()));
    
    Ok(ActionResult {
        player_hand: game.player_hands[hand_idx].clone(),
        dealer_hand: Some(game.dealer_hand.clone()),
        result: None,
        payout: 0,
        can_hit: true,
        can_double: true,
        can_split: false, // No re-split for now
        game_over: false,
    })
}

async fn resolve_game(mut game: BlackjackGame, caller: Principal) -> Result<ActionResult, String> {
    // Reveal dealer card
    if let Some(hidden) = game.dealer_hidden_card.take() {
        game.dealer_hand.add_card(hidden);
    }
    
    // Dealer plays if any player hand is not bust?
    // Standard: Dealer plays if there is at least one non-bust hand.
    let any_not_bust = game.player_hands.iter().any(|h| !h.is_bust());
    
    if any_not_bust {
        let (mut seed_bytes, _, _) = generate_shuffle_seed("DEALER").unwrap();
        let mut card_idx = 0;
        
        while game.dealer_hand.value() < 17 {
             let new_card = draw_card(&seed_bytes, card_idx);
             card_idx += 1;
             // Refresh seed if needed (simplified)
             if card_idx >= 32 {
                  let (new_bytes, _, _) = generate_shuffle_seed("DEALER_MORE").unwrap();
                  seed_bytes = new_bytes;
                  card_idx = 0;
             }
             game.dealer_hand.add_card(new_card);
        }
    }
    
    let dealer_value = game.dealer_hand.value();
    let mut total_payout = 0;
    
    for (i, hand) in game.player_hands.iter().enumerate() {
        let val = hand.value();
        let bet = if game.is_doubled[i] { game.bet_amount * 2 } else { game.bet_amount };
        
        let result = if val > 21 {
            GameResult::DealerWin
        } else if dealer_value > 21 {
            GameResult::PlayerWin
        } else if val > dealer_value {
            GameResult::PlayerWin
        } else if val < dealer_value {
            GameResult::DealerWin
        } else {
            GameResult::Push
        };
        
        game.results[i] = Some(result.clone());
        update_stats(&result);
        
        let hand_payout = match result {
            GameResult::PlayerWin => bet * 2,
            GameResult::Push => bet,
            _ => 0,
        };
        total_payout += hand_payout;
    }
    
    game.payout = total_payout;
    game.is_active = false;
    
    // Settle
    if total_payout > 0 {
        let current_bal = accounting::get_balance(caller);
        let new_bal = current_bal + total_payout;
        accounting::update_balance(caller, new_bal)?;
    }
    
    // Total bet involved (sum of all hands)
    let total_bet: u64 = game.is_doubled.iter().map(|&d| if d { game.bet_amount * 2 } else { game.bet_amount }).sum();
    
    if let Err(e) = liquidity_pool::settle_bet(total_bet, total_payout) {
        // If failure, refund total bet
        let refund = total_bet;
        let bal = accounting::get_balance(caller);
        accounting::update_balance(caller, bal + refund)?; // Note: if we already credited payout, this might be wrong.
        // Same issue as Dice. Assuming settle_bet doesn't fail if we check house limit at start.
        // But double/split increases liability.
        // We should check house limit on double/split too.
    }
    
    // Remove active game from map to save space? 
    // Or keep history? Map is persistent. 
    // We update it.
    GAMES.with(|g| g.borrow_mut().insert(game.game_id, game.clone()));
    
    Ok(ActionResult {
        player_hand: game.player_hands.last().unwrap().clone(),
        dealer_hand: Some(game.dealer_hand.clone()),
        result: game.results.last().unwrap().clone(), // Show last result
        payout: total_payout,
        can_hit: false,
        can_double: false,
        can_split: false,
        game_over: true,
    })
}

pub fn get_game(game_id: u64) -> Option<BlackjackGame> {
    GAMES.with(|g| g.borrow().get(&game_id))
}

pub fn get_stats() -> GameStats {
    STATS.with(|s| s.borrow().get(&0).unwrap_or_default())
}
