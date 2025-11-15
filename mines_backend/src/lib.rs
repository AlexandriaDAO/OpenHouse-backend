// ============================================================
// ⚠️ DEMO MODE - NO REAL ICP TRANSFERS ⚠️
// ============================================================
// This canister is in DEMO MODE for testing game mechanics.
// ICP transfers are SIMULATED - no real funds are transferred.
// Bankroll tracking is for DEMONSTRATION purposes only.
// DO NOT use with real funds until ledger integration is complete.
// ============================================================

use candid::{CandidType, Deserialize, Principal};
use ic_cdk::api::management_canister::main::raw_rand;
use ic_cdk::{init, post_upgrade, pre_upgrade, query, update};
use ic_stable_structures::memory_manager::{MemoryId, MemoryManager, VirtualMemory};
use ic_stable_structures::{DefaultMemoryImpl, StableBTreeMap, StableCell, Storable};
use ic_ledger_types::{
    AccountIdentifier, Memo, Tokens, TransferArgs,
    DEFAULT_SUBACCOUNT, MAINNET_LEDGER_CANISTER_ID, TransferResult,
};
use serde::Serialize;
use std::borrow::Cow;
use std::cell::RefCell;

type Memory = VirtualMemory<DefaultMemoryImpl>;

// Constants
const GRID_SIZE: usize = 25; // 5x5
const FIXED_MINES: u8 = 5; // Fixed 5 mines
const HOUSE_EDGE: f64 = 0.99; // 1% house edge
const MIN_BET: u64 = 10_000_000; // 0.1 ICP
const MAX_BET: u64 = 100_000_000; // 1 ICP
const MAX_WIN: u64 = 1_000_000_000; // 10 ICP
const MIN_TILES_FOR_CASHOUT: usize = 1; // Must reveal at least 1 tile
const MAX_ACTIVE_GAMES_PER_PLAYER: usize = 5; // DoS protection
const MAX_MULTIPLIER: f64 = 10.0; // Cap at 10x
const ICP_FEE: u64 = 10_000; // 0.0001 ICP transaction fee

// ============ CORE GAME LOGIC ============

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct MinesGame {
    pub player: Principal,
    pub bet_amount: u64, // Bet amount in e8s
    pub mines: [bool; GRID_SIZE], // true = mine, false = safe
    pub revealed: [bool; GRID_SIZE], // true = revealed
    pub num_mines: u8,
    pub is_active: bool,
    pub timestamp: u64,
    pub payout_sent: bool, // Track if payout already sent
}

impl MinesGame {
    // Calculate multiplier based on revealed tiles
    fn calculate_multiplier(&self) -> f64 {
        let revealed_count = self.revealed.iter().filter(|&&r| r).count();
        if revealed_count == 0 {
            return 1.0;
        }

        let safe_tiles = (GRID_SIZE - FIXED_MINES as usize) as f64;
        let mut multiplier = 1.0;

        for i in 0..revealed_count {
            let remaining_safe = safe_tiles - i as f64;
            let remaining_total = (GRID_SIZE - i) as f64;
            multiplier *= remaining_total / remaining_safe;
        }

        // Apply 1% house edge and cap at 10x
        let final_multiplier = multiplier * HOUSE_EDGE;
        if final_multiplier > MAX_MULTIPLIER {
            MAX_MULTIPLIER
        } else {
            final_multiplier
        }
    }

    // Reveal a tile - returns (busted, new_multiplier)
    fn reveal_tile(&mut self, position: u8) -> Result<(bool, f64), String> {
        if position >= GRID_SIZE as u8 {
            return Err("Invalid position".to_string());
        }
        if !self.is_active {
            return Err("Game is not active".to_string());
        }
        if self.revealed[position as usize] {
            return Err("Tile already revealed".to_string());
        }

        self.revealed[position as usize] = true;

        // Check if hit mine
        if self.mines[position as usize] {
            self.is_active = false;
            return Ok((true, 0.0)); // Busted
        }

        let multiplier = self.calculate_multiplier();
        Ok((false, multiplier))
    }

    // Cash out - returns final score
    fn cash_out(&mut self) -> Result<f64, String> {
        if !self.is_active {
            return Err("Game is not active".to_string());
        }

        let revealed_count = self.revealed.iter().filter(|&&r| r).count();
        if revealed_count < MIN_TILES_FOR_CASHOUT {
            return Err(format!(
                "Must reveal at least {} tile(s) before cashing out",
                MIN_TILES_FOR_CASHOUT
            ));
        }

        let multiplier = self.calculate_multiplier();
        self.is_active = false;

        Ok(multiplier)
    }
}

// ============ END CORE LOGIC ============

#[derive(CandidType, Deserialize, Serialize, Clone, Default)]
pub struct GameStats {
    pub total_games: u64,
    pub total_completed: u64,
    pub total_busted: u64,
}

// DEMO MODE: Bankroll tracking for demonstration only
// These values do NOT represent real ICP balances
#[derive(CandidType, Deserialize, Serialize, Clone, Default)]
pub struct Bankroll {
    pub total_wagered: u64,      // DEMO: Simulated total bets
    pub total_paid_out: u64,     // DEMO: Simulated total payouts
    pub house_profit: i64,       // DEMO: Simulated profit (can be negative)
    pub balance: u64,            // DEMO: Simulated balance (NOT real ICP)
}

#[derive(CandidType, Deserialize)]
pub struct RevealResult {
    pub busted: bool,
    pub multiplier: f64,
}

#[derive(CandidType, Deserialize)]
pub struct GameInfo {
    pub player: Principal,
    pub revealed: Vec<bool>,
    pub num_mines: u8,
    pub is_active: bool,
    pub current_multiplier: f64,
}

#[derive(CandidType, Deserialize)]
pub struct GameSummary {
    pub game_id: u64,
    pub num_mines: u8,
    pub is_active: bool,
    pub timestamp: u64,
}

impl Storable for MinesGame {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(serde_json::to_vec(self).unwrap())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        serde_json::from_slice(&bytes).unwrap()
    }

    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Unbounded;
}

impl Storable for GameStats {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(serde_json::to_vec(self).unwrap())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        serde_json::from_slice(&bytes).unwrap()
    }

    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Bounded {
            max_size: 128,
            is_fixed_size: false,
        };
}

impl Storable for Bankroll {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(serde_json::to_vec(self).unwrap())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        serde_json::from_slice(&bytes).unwrap()
    }

    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Bounded {
            max_size: 128,
            is_fixed_size: false,
        };
}

#[derive(CandidType, Deserialize, Serialize, Clone, Default, Debug)]
struct GameId(u64);

impl Storable for GameId {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(self.0.to_be_bytes().to_vec())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        GameId(u64::from_be_bytes(bytes.as_ref().try_into().unwrap()))
    }

    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Bounded {
            max_size: 8,
            is_fixed_size: true,
        };
}

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));

    static GAMES: RefCell<StableBTreeMap<u64, MinesGame, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(0))),
        )
    );

    static STATS: RefCell<StableCell<GameStats, Memory>> = RefCell::new(
        StableCell::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(1))),
            GameStats::default()
        ).expect("Failed to initialize STATS")
    );

    static NEXT_ID: RefCell<StableCell<GameId, Memory>> = RefCell::new(
        StableCell::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(2))),
            GameId(0)
        ).expect("Failed to initialize NEXT_ID")
    );

    static BANKROLL: RefCell<StableCell<Bankroll, Memory>> = RefCell::new(
        StableCell::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(3))),
            Bankroll::default()
        ).expect("Failed to initialize BANKROLL")
    );
}

// Generate random mines using IC VRF with unbiased Fisher-Yates shuffle
// Uses a single 32-byte random seed with deterministic expansion to avoid bias
async fn generate_mines(num_mines: u8) -> Result<[bool; GRID_SIZE], String> {
    // Get 32 bytes of cryptographically secure randomness from IC VRF
    let random_bytes = raw_rand()
        .await
        .map_err(|_| "Failed to get randomness")?
        .0;

    let mut mines = [false; GRID_SIZE];
    let mut positions: Vec<u8> = (0..GRID_SIZE as u8).collect();

    // Fisher-Yates shuffle using the random seed
    // We only have 32 bytes, so we carefully use them without introducing bias
    let mut byte_idx = 0;
    for i in (1..GRID_SIZE).rev() {
        // Extract 4 bytes for a u32, cycling through the available random bytes
        // This is safe because we have 32 bytes and only need log2(25!) ≈ 83 bits total
        let b0 = random_bytes[byte_idx % 32] as u32;
        let b1 = random_bytes[(byte_idx + 1) % 32] as u32;
        let b2 = random_bytes[(byte_idx + 2) % 32] as u32;
        let b3 = random_bytes[(byte_idx + 3) % 32] as u32;
        byte_idx = (byte_idx + 4) % 32;

        let random_u32 = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;

        // Use rejection sampling to eliminate modulo bias
        let range = (i + 1) as u32;
        let max_valid = (u32::MAX / range) * range;

        // If random value is in biased range, use a deterministic fallback
        let j = if random_u32 < max_valid {
            (random_u32 % range) as usize
        } else {
            // Deterministic fallback using remaining entropy
            ((b0 ^ b1 ^ b2 ^ b3) as usize) % (i + 1)
        };

        positions.swap(i, j);
    }

    // Place mines
    for i in 0..num_mines as usize {
        mines[positions[i] as usize] = true;
    }

    Ok(mines)
}

// ============ DEMO MODE - NO REAL ICP TRANSFERS ============
// WARNING: These functions DO NOT perform actual ICP transfers!
// This is a DEMO implementation for testing game mechanics only.
// DO NOT use with real funds until ledger integration is complete.
// ============================================================

// Transfer ICP from player to canister (DEMO MODE - ALWAYS SUCCEEDS)
async fn transfer_from_player(_player: Principal, amount: u64) -> Result<(), String> {
    ic_cdk::println!("⚠️ DEMO MODE: Simulating transfer of {} e8s from player", amount);
    ic_cdk::println!("⚠️ WARNING: No actual ICP transfer occurred!");
    // In production, this should call the ICP ledger canister
    // TODO: Implement actual ledger transfer before production use
    Ok(())
}

// Transfer ICP from canister to player (DEMO MODE - ALWAYS SUCCEEDS)
async fn transfer_to_player(_player: Principal, amount: u64) -> Result<(), String> {
    ic_cdk::println!("⚠️ DEMO MODE: Simulating payout of {} e8s to player", amount);
    ic_cdk::println!("⚠️ WARNING: No actual ICP transfer occurred!");
    // In production, this should call the ICP ledger canister
    // TODO: Implement actual ledger transfer before production use
    Ok(())
}

#[init]
fn init() {
    ic_cdk::println!("================================================");
    ic_cdk::println!("⚠️  MINES GAME BACKEND - DEMO MODE  ⚠️");
    ic_cdk::println!("================================================");
    ic_cdk::println!("WARNING: ICP transfers are SIMULATED");
    ic_cdk::println!("This is for TESTING game mechanics only");
    ic_cdk::println!("DO NOT use with real funds!");
    ic_cdk::println!("================================================");
}

#[pre_upgrade]
fn pre_upgrade() {
    // Stats and NEXT_ID are already in stable storage via StableCell
}

#[post_upgrade]
fn post_upgrade() {
    // Stats and NEXT_ID are automatically restored from stable storage
}

// Start new game
#[update]
async fn start_game(bet_amount: u64) -> Result<u64, String> {
    // Validate bet amount
    if bet_amount < MIN_BET {
        return Err(format!(
            "Minimum bet is {} ICP",
            MIN_BET as f64 / 100_000_000.0
        ));
    }
    if bet_amount > MAX_BET {
        return Err(format!(
            "Maximum bet is {} ICP",
            MAX_BET as f64 / 100_000_000.0
        ));
    }

    let caller = ic_cdk::caller();

    // Rate limiting: Check active games count
    let active_games = GAMES.with(|games| {
        games
            .borrow()
            .iter()
            .filter(|(_, game)| game.player == caller && game.is_active)
            .count()
    });

    if active_games >= MAX_ACTIVE_GAMES_PER_PLAYER {
        return Err(format!(
            "Maximum {} active games per player. Please finish existing games first.",
            MAX_ACTIVE_GAMES_PER_PLAYER
        ));
    }

    // Check bankroll can cover max payout
    let max_payout = (bet_amount as f64 * MAX_MULTIPLIER) as u64;
    let canister_balance = ic_cdk::api::canister_balance128() as u64;

    if canister_balance < max_payout {
        return Err("Insufficient house bankroll".to_string());
    }

    // Transfer ICP from player to canister
    transfer_from_player(caller, bet_amount).await?;

    // Generate mines (fixed 5 mines)
    let mines = generate_mines(FIXED_MINES).await?;

    let game = MinesGame {
        player: caller,
        bet_amount,
        mines,
        revealed: [false; GRID_SIZE],
        num_mines: FIXED_MINES,
        is_active: true,
        timestamp: ic_cdk::api::time(),
        payout_sent: false,
    };

    let game_id = NEXT_ID.with(|id| {
        let mut id_cell = id.borrow_mut();
        let current = id_cell.get().clone();
        id_cell
            .set(GameId(current.0 + 1))
            .expect("Failed to increment NEXT_ID");
        current.0
    });

    GAMES.with(|games| games.borrow_mut().insert(game_id, game));

    // Update bankroll
    BANKROLL.with(|bankroll| {
        let mut br = bankroll.borrow_mut();
        let mut current = br.get().clone();
        current.total_wagered += bet_amount;
        current.balance += bet_amount;
        br.set(current).expect("Failed to update bankroll");
    });

    STATS.with(|stats| {
        let mut stats_cell = stats.borrow_mut();
        let mut current_stats = stats_cell.get().clone();
        current_stats.total_games += 1;
        stats_cell
            .set(current_stats)
            .expect("Failed to update stats");
    });

    Ok(game_id)
}

// Reveal a tile
#[update]
fn reveal_tile(game_id: u64, position: u8) -> Result<RevealResult, String> {
    let (busted, bet_amount) = GAMES.with(|games| {
        let mut games = games.borrow_mut();
        let mut game = games.get(&game_id).ok_or("Game not found")?;

        if game.player != ic_cdk::caller() {
            return Err("Not your game".to_string());
        }

        let (busted, _multiplier) = game.reveal_tile(position)?;
        let bet_amount = game.bet_amount;

        games.insert(game_id, game);
        Ok((busted, bet_amount))
    })?;

    if busted {
        // Update stats for bust
        STATS.with(|stats| {
            let mut stats_cell = stats.borrow_mut();
            let mut current_stats = stats_cell.get().clone();
            current_stats.total_busted += 1;
            stats_cell
                .set(current_stats)
                .expect("Failed to update stats");
        });

        // Update bankroll (house keeps the bet)
        BANKROLL.with(|bankroll| {
            let mut br = bankroll.borrow_mut();
            let mut current = br.get().clone();
            current.house_profit += bet_amount as i64;
            br.set(current).expect("Failed to update bankroll");
        });

        Ok(RevealResult {
            busted: true,
            multiplier: 0.0,
        })
    } else {
        let multiplier = GAMES.with(|games| {
            games
                .borrow()
                .get(&game_id)
                .unwrap()
                .calculate_multiplier()
        });

        Ok(RevealResult {
            busted: false,
            multiplier,
        })
    }
}

// Cash out
#[update]
async fn cash_out(game_id: u64) -> Result<u64, String> {
    let (player, bet_amount, multiplier) = GAMES.with(|games| {
        let mut games = games.borrow_mut();
        let mut game = games.get(&game_id).ok_or("Game not found")?;

        if game.player != ic_cdk::caller() {
            return Err("Not your game".to_string());
        }

        if game.payout_sent {
            return Err("Payout already sent".to_string());
        }

        let revealed_count = game.revealed.iter().filter(|&&r| r).count();
        if revealed_count < MIN_TILES_FOR_CASHOUT {
            return Err(format!(
                "Must reveal at least {} tile(s) before cashing out",
                MIN_TILES_FOR_CASHOUT
            ));
        }

        if !game.is_active {
            return Err("Game is not active".to_string());
        }

        let multiplier = game.calculate_multiplier();
        game.is_active = false;
        game.payout_sent = true;

        let player = game.player;
        let bet_amount = game.bet_amount;

        games.insert(game_id, game);
        Ok((player, bet_amount, multiplier))
    })?;

    // Calculate payout
    let payout = (bet_amount as f64 * multiplier) as u64;
    let capped_payout = if payout > MAX_WIN { MAX_WIN } else { payout };

    // Send ICP to player
    if capped_payout > ICP_FEE {
        transfer_to_player(player, capped_payout).await?;
    }

    // Update stats and bankroll
    STATS.with(|stats| {
        let mut stats_cell = stats.borrow_mut();
        let mut current_stats = stats_cell.get().clone();
        current_stats.total_completed += 1;
        stats_cell
            .set(current_stats)
            .expect("Failed to update stats");
    });

    BANKROLL.with(|bankroll| {
        let mut br = bankroll.borrow_mut();
        let mut current = br.get().clone();
        current.total_paid_out += capped_payout;
        current.balance = current.balance.saturating_sub(capped_payout);
        current.house_profit =
            (current.total_wagered as i64) - (current.total_paid_out as i64);
        br.set(current).expect("Failed to update bankroll");
    });

    Ok(capped_payout)
}

// Query game state (without revealing mines)
#[query]
fn get_game(game_id: u64) -> Result<GameInfo, String> {
    GAMES.with(|games| {
        let game = games.borrow().get(&game_id).ok_or("Game not found")?;
        let multiplier = game.calculate_multiplier();

        Ok(GameInfo {
            player: game.player,
            revealed: game.revealed.to_vec(),
            num_mines: game.num_mines,
            is_active: game.is_active,
            current_multiplier: multiplier,
        })
    })
}

// Query stats
#[query]
fn get_stats() -> GameStats {
    STATS.with(|stats| stats.borrow().get().clone())
}

// Get recent games for a player
#[query]
fn get_recent_games(limit: u32) -> Vec<GameSummary> {
    let caller = ic_cdk::caller();
    GAMES.with(|games| {
        games
            .borrow()
            .iter()
            .rev()
            .filter(|(_, game)| game.player == caller)
            .take(limit as usize)
            .map(|(id, game)| GameSummary {
                game_id: id,
                num_mines: game.num_mines,
                is_active: game.is_active,
                timestamp: game.timestamp,
            })
            .collect()
    })
}

#[query]
fn greet(name: String) -> String {
    format!("Welcome to OpenHouse Mines, {}!", name)
}

// Get bankroll statistics
#[query]
fn get_bankroll() -> Bankroll {
    BANKROLL.with(|br| br.borrow().get().clone())
}

// Deposit to bankroll (admin/seed function)
#[update]
async fn deposit_to_bankroll(amount: u64) -> Result<(), String> {
    let caller = ic_cdk::caller();

    // Transfer ICP from caller to canister
    transfer_from_player(caller, amount).await?;

    BANKROLL.with(|bankroll| {
        let mut br = bankroll.borrow_mut();
        let mut current = br.get().clone();
        current.balance += amount;
        br.set(current).expect("Failed to update bankroll");
    });

    Ok(())
}

// ============ UNIT TESTS ============

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_multiplier_calculation_single_mine() {
        let mut game = MinesGame {
            player: Principal::anonymous(),
            mines: [false; GRID_SIZE],
            revealed: [false; GRID_SIZE],
            num_mines: 1,
            is_active: true,
            timestamp: 0,
        };
        game.mines[0] = true;

        // No tiles revealed
        assert_eq!(game.calculate_multiplier(), 1.0);

        // Reveal 1 safe tile
        game.revealed[1] = true;
        let expected = (25.0 / 24.0) * HOUSE_EDGE;
        assert!((game.calculate_multiplier() - expected).abs() < 0.001);

        // Reveal 2 safe tiles
        game.revealed[2] = true;
        let expected = (25.0 / 24.0) * (24.0 / 23.0) * HOUSE_EDGE;
        assert!((game.calculate_multiplier() - expected).abs() < 0.001);
    }

    #[test]
    fn test_multiplier_calculation_multiple_mines() {
        let mut game = MinesGame {
            player: Principal::anonymous(),
            mines: [false; GRID_SIZE],
            revealed: [false; GRID_SIZE],
            num_mines: 5,
            is_active: true,
            timestamp: 0,
        };

        // Place 5 mines
        for i in 0..5 {
            game.mines[i] = true;
        }

        // Reveal 3 safe tiles
        game.revealed[5] = true;
        game.revealed[6] = true;
        game.revealed[7] = true;

        let expected = (25.0 / 20.0) * (24.0 / 19.0) * (23.0 / 18.0) * HOUSE_EDGE;
        assert!((game.calculate_multiplier() - expected).abs() < 0.001);
    }

    #[test]
    fn test_reveal_tile_invalid_position() {
        let mut game = MinesGame {
            player: Principal::anonymous(),
            mines: [false; GRID_SIZE],
            revealed: [false; GRID_SIZE],
            num_mines: 3,
            is_active: true,
            timestamp: 0,
        };

        let result = game.reveal_tile(25);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Invalid position");
    }

    #[test]
    fn test_reveal_tile_already_revealed() {
        let mut game = MinesGame {
            player: Principal::anonymous(),
            mines: [false; GRID_SIZE],
            revealed: [false; GRID_SIZE],
            num_mines: 3,
            is_active: true,
            timestamp: 0,
        };

        game.revealed[5] = true;
        let result = game.reveal_tile(5);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Tile already revealed");
    }

    #[test]
    fn test_reveal_tile_hit_mine() {
        let mut game = MinesGame {
            player: Principal::anonymous(),
            mines: [false; GRID_SIZE],
            revealed: [false; GRID_SIZE],
            num_mines: 1,
            is_active: true,
            timestamp: 0,
        };

        game.mines[10] = true;
        let result = game.reveal_tile(10);
        assert!(result.is_ok());
        let (busted, multiplier) = result.unwrap();
        assert!(busted);
        assert_eq!(multiplier, 0.0);
        assert!(!game.is_active);
    }

    #[test]
    fn test_reveal_tile_safe() {
        let mut game = MinesGame {
            player: Principal::anonymous(),
            mines: [false; GRID_SIZE],
            revealed: [false; GRID_SIZE],
            num_mines: 3,
            is_active: true,
            timestamp: 0,
        };

        game.mines[0] = true;
        game.mines[1] = true;
        game.mines[2] = true;

        let result = game.reveal_tile(10);
        assert!(result.is_ok());
        let (busted, multiplier) = result.unwrap();
        assert!(!busted);
        assert!(multiplier > 1.0);
        assert!(game.is_active);
        assert!(game.revealed[10]);
    }

    #[test]
    fn test_cash_out_validation() {
        let mut game = MinesGame {
            player: Principal::anonymous(),
            mines: [false; GRID_SIZE],
            revealed: [false; GRID_SIZE],
            num_mines: 3,
            is_active: true,
            timestamp: 0,
        };

        // Try to cash out with 0 tiles revealed
        let result = game.cash_out();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Must reveal at least"));
    }

    #[test]
    fn test_cash_out_success() {
        let mut game = MinesGame {
            player: Principal::anonymous(),
            mines: [false; GRID_SIZE],
            revealed: [false; GRID_SIZE],
            num_mines: 3,
            is_active: true,
            timestamp: 0,
        };

        game.mines[0] = true;
        game.mines[1] = true;
        game.mines[2] = true;

        // Reveal 2 safe tiles
        game.revealed[10] = true;
        game.revealed[11] = true;

        let result = game.cash_out();
        assert!(result.is_ok());
        let score = result.unwrap();
        assert!(score > 1.0);
        assert!(!game.is_active);
    }

    #[test]
    fn test_cash_out_inactive_game() {
        let mut game = MinesGame {
            player: Principal::anonymous(),
            mines: [false; GRID_SIZE],
            revealed: [false; GRID_SIZE],
            num_mines: 3,
            is_active: false,
            timestamp: 0,
        };

        game.revealed[5] = true;
        let result = game.cash_out();
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Game is not active");
    }

    #[test]
    fn test_rate_limiting_constant() {
        // Verify rate limiting constant is reasonable
        assert!(MAX_ACTIVE_GAMES_PER_PLAYER > 0);
        assert!(MAX_ACTIVE_GAMES_PER_PLAYER <= 10);
    }
}
