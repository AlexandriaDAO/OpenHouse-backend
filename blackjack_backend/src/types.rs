use candid::{CandidType, Deserialize, Principal};
use serde::Serialize;
use ic_stable_structures::Storable;
use std::borrow::Cow;

#[derive(CandidType, Deserialize, Serialize, Clone, Copy, PartialEq, Debug)]
pub enum Suit {
    Hearts,
    Diamonds,
    Clubs,
    Spades,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Copy, PartialEq, Debug)]
pub enum Rank {
    Ace,    // 1 or 11
    Two,    // 2
    Three,  // 3
    Four,   // 4
    Five,   // 5
    Six,    // 6
    Seven,  // 7
    Eight,  // 8
    Nine,   // 9
    Ten,    // 10
    Jack,   // 10
    Queen,  // 10
    King,   // 10
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct Card {
    pub suit: Suit,
    pub rank: Rank,
}

impl Card {
    pub fn value(&self) -> u8 {
        match self.rank {
            Rank::Ace => 11,
            Rank::Two => 2,
            Rank::Three => 3,
            Rank::Four => 4,
            Rank::Five => 5,
            Rank::Six => 6,
            Rank::Seven => 7,
            Rank::Eight => 8,
            Rank::Nine => 9,
            Rank::Ten | Rank::Jack | Rank::Queen | Rank::King => 10,
        }
    }

    pub fn is_ace(&self) -> bool {
        matches!(self.rank, Rank::Ace)
    }
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct Hand {
    pub cards: Vec<Card>,
}

impl Hand {
    pub fn new() -> Self {
        Self { cards: Vec::new() }
    }

    pub fn add_card(&mut self, card: Card) {
        self.cards.push(card);
    }

    pub fn value(&self) -> u8 {
        let mut sum: u32 = 0;
        let mut aces = 0;

        for card in &self.cards {
            sum += card.value() as u32;
            if card.is_ace() {
                aces += 1;
            }
        }

        while sum > 21 && aces > 0 {
            sum -= 10;
            aces -= 1;
        }

        sum as u8
    }

    pub fn is_blackjack(&self) -> bool {
        self.cards.len() == 2 && self.value() == 21
    }

    pub fn is_bust(&self) -> bool {
        self.value() > 21
    }

    pub fn can_split(&self) -> bool {
        self.cards.len() == 2 && self.cards[0].rank == self.cards[1].rank
    }

    pub fn is_soft(&self) -> bool {
        let mut sum = 0;
        let mut has_ace = false;
        for card in &self.cards {
            if card.is_ace() { has_ace = true; }
            sum += if card.is_ace() { 1 } else { card.value() };
        }
        
        if !has_ace { return false; }
        
        // If we can add 10 (making an ace 11) and stay <= 21, it is soft.
        sum <= 11
    }
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub enum GameAction {
    Hit,
    Stand,
    Double,
    Split,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug, PartialEq)]
pub enum GameResult {
    PlayerWin,
    DealerWin,
    Push,         // Tie
    Blackjack,    // Player blackjack (3:2 payout)
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct BlackjackGame {
    pub game_id: u64,
    pub player: Principal,
    pub bet_amount: u64,
    pub player_hands: Vec<Hand>,      // Multiple for splits
    pub dealer_hand: Hand,
    pub dealer_hidden_card: Option<Card>,  // Revealed on stand
    pub current_hand_index: u8,       // Which hand is active (for splits)
    pub is_active: bool,
    pub is_doubled: Vec<bool>,        // Per hand
    pub results: Vec<Option<GameResult>>,
    pub payout: u64,
    pub timestamp: u64,
}

impl Storable for BlackjackGame {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Owned(serde_json::to_vec(self).unwrap())
    }

    fn into_bytes(self) -> Vec<u8> {
        self.to_bytes().into_owned()
    }

    fn from_bytes(bytes: Cow<'_, [u8]>) -> Self {
        serde_json::from_slice(&bytes).unwrap()
    }

    const BOUND: ic_stable_structures::storable::Bound = ic_stable_structures::storable::Bound::Bounded {
        max_size: 2048, // Estimate: Should be plenty for standard blackjack game
        is_fixed_size: false,
    };
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct GameStartResult {
    pub game_id: u64,
    pub player_hand: Hand,
    pub dealer_showing: Card,
    pub is_blackjack: bool,
    pub can_double: bool,
    pub can_split: bool,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct ActionResult {
    pub player_hand: Hand,
    pub dealer_hand: Option<Hand>,    // Revealed when round ends
    pub result: Option<GameResult>,
    pub payout: u64,
    pub can_hit: bool,
    pub can_double: bool,
    pub can_split: bool,
    pub game_over: bool,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug, Default)]
pub struct GameStats {
    pub total_games: u64,
    pub total_player_wins: u64,
    pub total_dealer_wins: u64,
    pub total_pushes: u64,
    pub total_blackjacks: u64,
}

impl Storable for GameStats {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Owned(serde_json::to_vec(self).unwrap())
    }

    fn into_bytes(self) -> Vec<u8> {
        self.to_bytes().into_owned()
    }

    fn from_bytes(bytes: Cow<'_, [u8]>) -> Self {
        serde_json::from_slice(&bytes).unwrap()
    }

    const BOUND: ic_stable_structures::storable::Bound = ic_stable_structures::storable::Bound::Bounded {
        max_size: 256,
        is_fixed_size: false,
    };
}

#[derive(Clone, Debug, Serialize, Deserialize, CandidType, Default)]
pub struct RandomnessSeed {
    pub current_seed: [u8; 32],
    pub creation_time: u64,
    pub games_used: u64,
    pub max_games: u64,
    pub nonce: u64,
}

impl Storable for RandomnessSeed {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Owned(serde_json::to_vec(self).unwrap())
    }

    fn into_bytes(self) -> Vec<u8> {
        self.to_bytes().into_owned()
    }

    fn from_bytes(bytes: Cow<'_, [u8]>) -> Self {
        serde_json::from_slice(&bytes).unwrap()
    }

    const BOUND: ic_stable_structures::storable::Bound = ic_stable_structures::storable::Bound::Bounded {
        max_size: 256,
        is_fixed_size: false,
    };
}

// =============================================================================
// CONSTANTS
// =============================================================================

pub const CKUSDT_CANISTER_ID: &str = "cngnf-vqaaa-aaaar-qag4q-cai";
pub const CKUSDT_TRANSFER_FEE: u64 = 10_000;

// =============================================================================
// ICRC-2 TYPES
// =============================================================================

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct Account {
    pub owner: Principal,
    pub subaccount: Option<[u8; 32]>,
}

impl From<Principal> for Account {
    fn from(owner: Principal) -> Self {
        Self {
            owner,
            subaccount: None,
        }
    }
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct TransferFromArgs {
    pub from: Account,
    pub to: Account,
    pub amount: candid::Nat,
    pub fee: Option<candid::Nat>,
    pub memo: Option<Vec<u8>>,
    pub created_at_time: Option<u64>,
    pub spender_subaccount: Option<[u8; 32]>,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub enum TransferFromError {
    BadFee { expected_fee: candid::Nat },
    BadBurn { min_burn_amount: candid::Nat },
    InsufficientFunds { balance: candid::Nat },
    InsufficientAllowance { allowance: candid::Nat },
    TooOld,
    CreatedInFuture { ledger_time: u64 },
    Duplicate { duplicate_of: candid::Nat },
    TemporarilyUnavailable,
    GenericError { error_code: candid::Nat, message: String },
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct TransferArg {
    pub from_subaccount: Option<[u8; 32]>,
    pub to: Account,
    pub amount: candid::Nat,
    pub fee: Option<candid::Nat>,
    pub memo: Option<Vec<u8>>,
    pub created_at_time: Option<u64>,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub enum TransferError {
    BadFee { expected_fee: candid::Nat },
    BadBurn { min_burn_amount: candid::Nat },
    InsufficientFunds { balance: candid::Nat },
    TooOld,
    CreatedInFuture { ledger_time: u64 },
    Duplicate { duplicate_of: candid::Nat },
    TemporarilyUnavailable,
    GenericError { error_code: candid::Nat, message: String },
}
