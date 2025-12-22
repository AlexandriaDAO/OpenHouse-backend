// Monte Carlo simulation tests for mathematical verification
//
// These tests verify that the Plinko game's mathematical properties hold
// in practice, not just in theory. They prove:
// 1. House edge is exactly 1% (EV = 0.99)
// 2. Variance bounds are conservative enough for multi-ball betting
// 3. Multiplier distribution matches binomial expectations

pub mod ev_convergence;
pub mod variance_bounds;
pub mod drawdown;
