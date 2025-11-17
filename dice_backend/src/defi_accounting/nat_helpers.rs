// Nat arithmetic helpers based on KongSwap patterns
use candid::Nat;
use num_bigint::BigUint;
use ic_stable_structures::Storable;
use std::borrow::Cow;

pub fn nat_zero() -> Nat {
    Nat::from(0u64)
}

pub fn nat_one() -> Nat {
    Nat::from(1u64)
}

pub fn nat_is_zero(n: &Nat) -> bool {
    n == &nat_zero()
}

// Integer division - ALWAYS ROUNDS DOWN
pub fn nat_divide(numerator: &Nat, denominator: &Nat) -> Option<Nat> {
    if nat_is_zero(numerator) {
        return Some(nat_zero());
    }
    if nat_is_zero(denominator) {
        return None; // Division by zero
    }
    Some(Nat(numerator.0.clone() / denominator.0.clone()))
}

// Safe multiplication - Cannot overflow with Nat
pub fn nat_multiply(n1: &Nat, n2: &Nat) -> Nat {
    Nat(n1.0.clone() * n2.0.clone())
}

// Safe addition
pub fn nat_add(n1: &Nat, n2: &Nat) -> Nat {
    Nat(n1.0.clone() + n2.0.clone())
}

// Safe subtraction - returns None if would underflow
pub fn nat_subtract(n1: &Nat, n2: &Nat) -> Option<Nat> {
    if n1 < n2 {
        None
    } else {
        Some(Nat(n1.0.clone() - n2.0.clone()))
    }
}

// Square root for initial liquidity - rounds down
pub fn nat_sqrt(n: &Nat) -> Nat {
    Nat(n.0.sqrt())
}

// Convert u64 (ICP e8s) to Nat
pub fn u64_to_nat(n: u64) -> Nat {
    Nat::from(n)
}

// Convert Nat to u64 - returns None if too large
pub fn nat_to_u64(n: &Nat) -> Option<u64> {
    // Check if Nat fits in u64
    if n.0 > BigUint::from(u64::MAX) {
        None
    } else {
        let digits = n.0.to_u64_digits();
        if digits.is_empty() {
            Some(0)
        } else {
            Some(digits[0])
        }
    }
}

// Minimum of two Nats
pub fn nat_min(n1: &Nat, n2: &Nat) -> Nat {
    if n1 <= n2 {
        n1.clone()
    } else {
        n2.clone()
    }
}

// =============================================================================
// STORABLE WRAPPER FOR NAT
// =============================================================================

/// Wrapper for Nat that implements Storable for ic-stable-structures
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct StorableNat(pub Nat);

impl From<Nat> for StorableNat {
    fn from(n: Nat) -> Self {
        StorableNat(n)
    }
}

impl From<StorableNat> for Nat {
    fn from(s: StorableNat) -> Self {
        s.0
    }
}

impl From<u64> for StorableNat {
    fn from(n: u64) -> Self {
        StorableNat(Nat::from(n))
    }
}

impl Storable for StorableNat {
    fn to_bytes(&self) -> Cow<[u8]> {
        // Serialize BigUint to bytes
        let bytes = self.0.0.to_bytes_be();
        // Prepend length as u32 (4 bytes)
        let len = bytes.len() as u32;
        let mut result = len.to_be_bytes().to_vec();
        result.extend_from_slice(&bytes);
        Cow::Owned(result)
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        if bytes.len() < 4 {
            return StorableNat(nat_zero());
        }
        // Read length from first 4 bytes
        let len = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
        if bytes.len() < 4 + len {
            return StorableNat(nat_zero());
        }
        // Parse BigUint from remaining bytes
        let bigint_bytes = &bytes[4..4+len];
        let biguint = BigUint::from_bytes_be(bigint_bytes);
        StorableNat(Nat(biguint))
    }

    const BOUND: ic_stable_structures::storable::Bound = ic_stable_structures::storable::Bound::Unbounded;
}

// Helper functions for StorableNat
pub fn storable_nat_zero() -> StorableNat {
    StorableNat(nat_zero())
}

pub fn storable_nat_to_nat(s: &StorableNat) -> Nat {
    s.0.clone()
}
