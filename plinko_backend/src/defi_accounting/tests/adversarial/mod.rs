//! Adversarial Security Tests
//!
//! These tests ATTEMPT TO BREAK the plinko_backend accounting system.
//! Each test tries a specific attack vector. Tests PASS if the attack is thwarted, FAIL if the attack succeeds.

mod integer_attacks;
mod division_attacks;
mod lp_manipulation;
mod balance_extraction;
mod boundary_exploits;
mod state_corruption;
