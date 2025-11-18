// Full implementation - Nat arithmetic helpers
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

// Always rounds down
pub fn nat_divide(numerator: &Nat, denominator: &Nat) -> Option<Nat> {
    if nat_is_zero(denominator) {
        return None;
    }
    Some(Nat(numerator.0.clone() / denominator.0.clone()))
}

pub fn nat_multiply(n1: &Nat, n2: &Nat) -> Nat {
    Nat(n1.0.clone() * n2.0.clone())
}

pub fn nat_add(n1: &Nat, n2: &Nat) -> Nat {
    Nat(n1.0.clone() + n2.0.clone())
}

pub fn nat_subtract(n1: &Nat, n2: &Nat) -> Option<Nat> {
    if n1 < n2 {
        None
    } else {
        Some(Nat(n1.0.clone() - n2.0.clone()))
    }
}

pub fn nat_sqrt(n: &Nat) -> Nat {
    Nat(n.0.sqrt())
}

pub fn u64_to_nat(n: u64) -> Nat {
    Nat::from(n)
}

pub fn nat_to_u64(n: &Nat) -> Option<u64> {
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

// Storable wrapper for Nat (needed for StableBTreeMap)
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
        let bytes = self.0.0.to_bytes_be();
        let len = bytes.len() as u32;
        let mut result = len.to_be_bytes().to_vec();
        result.extend_from_slice(&bytes);
        Cow::Owned(result)
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        if bytes.len() < 4 {
            return StorableNat(nat_zero());
        }
        let len = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
        if bytes.len() < 4 + len {
            return StorableNat(nat_zero());
        }
        let bigint_bytes = &bytes[4..4+len];
        let biguint = BigUint::from_bytes_be(bigint_bytes);
        StorableNat(Nat(biguint))
    }

    const BOUND: ic_stable_structures::storable::Bound = ic_stable_structures::storable::Bound::Unbounded;
}
