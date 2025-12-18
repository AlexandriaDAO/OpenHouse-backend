//! Unit tests for Life2 backend
//!
//! Tests cell encoding, coordinate systems, Conway's rules, and simulation correctness.

use super::*;

#[test]
fn test_cell_encoding() {
    // Test all combinations
    for owner in 0..=9 {
        for coins in 0..=7 {
            for alive in [false, true] {
                let cell = make_cell(owner, alive, coins);
                assert_eq!(get_owner(cell), owner, "owner mismatch");
                assert_eq!(is_alive(cell), alive, "alive mismatch");
                assert_eq!(get_coins(cell), coins, "coins mismatch");
            }
        }
    }
}

#[test]
fn test_cell_encoding_specific_values() {
    // Test specific values from the plan
    assert_eq!(make_cell(0, false, 0), 0); // Dead, unclaimed, 0 coins
    assert_eq!(make_cell(1, false, 0), 1); // Dead, Player 1 territory, 0 coins
    assert_eq!(make_cell(1, true, 0), 17); // Alive, Player 1, 0 coins
    assert_eq!(make_cell(1, true, 1), 49); // Alive, Player 1, 1 coin
    assert_eq!(make_cell(5, true, 3), 117); // Alive, Player 5, 3 coins
    assert_eq!(make_cell(2, false, 7), 226); // Dead, Player 2 territory, 7 coins
}

#[test]
fn test_coordinate_conversion() {
    // Test basic conversion
    assert_eq!(coord_to_index(0, 0), 0);
    assert_eq!(coord_to_index(511, 511), 262143);
    assert_eq!(coord_to_index(100, 200), 200 * 512 + 100);

    // Test inverse
    assert_eq!(index_to_coord(0), (0, 0));
    assert_eq!(index_to_coord(262143), (511, 511));
    assert_eq!(index_to_coord(200 * 512 + 100), (100, 200));
}

#[test]
fn test_coordinate_wrapping() {
    // Test neighbor wrapping at corners
    let neighbors = get_neighbor_indices(0); // Top-left corner
    assert!(neighbors.contains(&coord_to_index(511, 511))); // NW wraps
    assert!(neighbors.contains(&coord_to_index(511, 0))); // W wraps
    assert!(neighbors.contains(&coord_to_index(0, 511))); // N wraps

    // Test bottom-right corner
    let neighbors = get_neighbor_indices(coord_to_index(511, 511));
    assert!(neighbors.contains(&coord_to_index(0, 0))); // SE wraps
    assert!(neighbors.contains(&coord_to_index(0, 511))); // E wraps
    assert!(neighbors.contains(&coord_to_index(511, 0))); // S wraps
}

#[test]
fn test_neighbor_count() {
    let idx = coord_to_index(256, 256); // Center cell
    let neighbors = get_neighbor_indices(idx);
    assert_eq!(neighbors.len(), 8);

    // Verify all neighbors are unique
    let mut unique = std::collections::HashSet::new();
    for n in neighbors {
        assert!(unique.insert(n), "Duplicate neighbor index");
    }
}

#[test]
fn test_coins_cap_at_7() {
    // Test coins are capped at 7 (3 bits max = 0b111 = 7)
    let cell = make_cell(1, true, 7);
    assert_eq!(get_coins(cell), 7);

    // Verify coins overflow is capped
    let cell2 = make_cell(1, true, 10); // Try to set coins > 7
    assert_eq!(get_coins(cell2), 2); // 10 & 0x07 = 2 (masked)
}

#[test]
fn test_set_alive() {
    let cell = make_cell(3, false, 2);
    assert!(!is_alive(cell));

    let cell2 = set_alive(cell, true);
    assert!(is_alive(cell2));
    assert_eq!(get_owner(cell2), 3);
    assert_eq!(get_coins(cell2), 2);

    let cell3 = set_alive(cell2, false);
    assert!(!is_alive(cell3));
    assert_eq!(get_owner(cell3), 3);
    assert_eq!(get_coins(cell3), 2);
}

#[test]
fn test_find_majority_owner_single_winner() {
    let mut counts = [0u8; 10];
    counts[3] = 2; // Player 3 has 2 neighbors
    counts[5] = 1; // Player 5 has 1 neighbor
    assert_eq!(find_majority_owner(&counts, 0), 3);
}

#[test]
fn test_find_majority_owner_tie_fair_distribution() {
    // P1, P3, P5 tied with 1 neighbor each
    let mut counts = [0u8; 10];
    counts[1] = 1;
    counts[3] = 1;
    counts[5] = 1;

    // Different cell positions should give different winners
    assert_eq!(find_majority_owner(&counts, 0), 1); // 0 % 3 = 0 → P1
    assert_eq!(find_majority_owner(&counts, 1), 3); // 1 % 3 = 1 → P3
    assert_eq!(find_majority_owner(&counts, 2), 5); // 2 % 3 = 2 → P5
    assert_eq!(find_majority_owner(&counts, 3), 1); // 3 % 3 = 0 → P1
}

#[test]
fn test_find_majority_owner_no_neighbors() {
    let counts = [0u8; 10];
    assert_eq!(find_majority_owner(&counts, 0), 1); // Default to P1
}

/// Test that a blinker oscillates correctly (proves two-pass algorithm works)
/// Blinker: 3 cells in a row, oscillates between horizontal/vertical
///   .X.     ...
///   .X.  -> XXX -> (back to vertical)
///   .X.     ...
#[test]
fn test_blinker_oscillator() {
    // Create isolated test grid and potential
    let mut grid = [0u8; TOTAL_CELLS];
    let mut potential = [0u64; GRID_WORDS];
    let mut next_potential = [0u64; GRID_WORDS];
    let mut balances = HashMap::new();
    let test_principal = Principal::anonymous();
    balances.insert(test_principal, 1000u64);
    let players = vec![test_principal];

    // Set up vertical blinker at (100, 100)
    let cells = [
        coord_to_index(100, 99),  // top
        coord_to_index(100, 100), // middle
        coord_to_index(100, 101), // bottom
    ];

    for &idx in &cells {
        grid[idx] = make_cell(1, true, 0);
        add_with_neighbors(&mut potential, idx);
    }

    // Verify initial state: 3 cells in vertical line
    assert!(is_alive(grid[coord_to_index(100, 99)]));
    assert!(is_alive(grid[coord_to_index(100, 100)]));
    assert!(is_alive(grid[coord_to_index(100, 101)]));
    assert!(!is_alive(grid[coord_to_index(99, 100)]));
    assert!(!is_alive(grid[coord_to_index(101, 100)]));

    // Run one generation using TWO-PASS algorithm
    let mut changes: Vec<(usize, CellChange)> = Vec::new();

    // Pass 1: Compute fates
    for word_idx in 0..GRID_WORDS {
        let mut word = potential[word_idx];
        if word == 0 {
            continue;
        }

        while word != 0 {
            let bit_pos = word.trailing_zeros() as usize;
            let idx = (word_idx << 6) | bit_pos;

            let (change, _) = compute_cell_fate(&grid, idx);
            if !matches!(change, CellChange::StaysDead) {
                changes.push((idx, change));
            }

            word &= word - 1;
        }
    }

    // Pass 2: Apply changes
    next_potential.fill(0);
    for (idx, change) in changes {
        apply_cell_change(&mut grid, &mut next_potential, &mut balances, &players, idx, change);
    }

    // Verify blinker rotated to horizontal
    // Old vertical cells: (100,99) and (100,101) should be DEAD
    // New horizontal cells: (99,100) and (101,100) should be ALIVE
    // Center (100,100) should remain ALIVE
    assert!(!is_alive(grid[coord_to_index(100, 99)]), "top should be dead");
    assert!(
        is_alive(grid[coord_to_index(100, 100)]),
        "center should be alive"
    );
    assert!(
        !is_alive(grid[coord_to_index(100, 101)]),
        "bottom should be dead"
    );
    assert!(
        is_alive(grid[coord_to_index(99, 100)]),
        "left should be alive"
    );
    assert!(
        is_alive(grid[coord_to_index(101, 100)]),
        "right should be alive"
    );
}

/// Test glider moves correctly over 4 generations
/// Glider pattern:
///   .X.     ...     ...     ...     ..X
///   ..X  -> X.X  -> ..X  -> X..  -> ...
///   XXX     .XX     X.X     .XX     .XX
///           .X.     .XX     .X.     ..X
#[test]
fn test_glider_motion() {
    let mut grid = [0u8; TOTAL_CELLS];
    let mut potential = [0u64; GRID_WORDS];
    let mut next_potential = [0u64; GRID_WORDS];
    let mut balances = HashMap::new();
    let test_principal = Principal::anonymous();
    balances.insert(test_principal, 1000u64);
    let players = vec![test_principal];

    // Standard glider at (10, 10) - using same orientation as classic
    // .X.
    // ..X
    // XXX
    let initial_cells = [
        (11, 10),               // top center
        (12, 11),               // middle right
        (10, 12),
        (11, 12),
        (12, 12), // bottom row
    ];

    for &(x, y) in &initial_cells {
        let idx = coord_to_index(x, y);
        grid[idx] = make_cell(1, true, 0);
        add_with_neighbors(&mut potential, idx);
    }

    // Helper to run one generation
    let run_generation = |grid: &mut [u8; TOTAL_CELLS],
                          potential: &mut [u64; GRID_WORDS],
                          next_potential: &mut [u64; GRID_WORDS],
                          balances: &mut HashMap<Principal, u64>,
                          players: &[Principal]| {
        let mut changes: Vec<(usize, CellChange)> = Vec::new();

        for word_idx in 0..GRID_WORDS {
            let mut word = potential[word_idx];
            if word == 0 {
                continue;
            }

            while word != 0 {
                let bit_pos = word.trailing_zeros() as usize;
                let idx = (word_idx << 6) | bit_pos;

                let (change, _) = compute_cell_fate(grid, idx);
                if !matches!(change, CellChange::StaysDead) {
                    changes.push((idx, change));
                }

                word &= word - 1;
            }
        }

        next_potential.fill(0);
        for (idx, change) in changes {
            apply_cell_change(grid, next_potential, balances, players, idx, change);
        }

        std::mem::swap(potential, next_potential);
    };

    // Count alive cells
    let count_alive = |grid: &[u8; TOTAL_CELLS]| -> u32 {
        grid.iter().filter(|&&c| is_alive(c)).count() as u32
    };

    // Glider should always have exactly 5 cells
    assert_eq!(count_alive(&grid), 5, "initial should have 5 cells");

    // Run 4 generations (one full glider cycle)
    for gen in 0..4 {
        run_generation(
            &mut grid,
            &mut potential,
            &mut next_potential,
            &mut balances,
            &players,
        );
        assert_eq!(
            count_alive(&grid),
            5,
            "generation {} should have 5 cells",
            gen + 1
        );
    }

    // After 4 generations, glider should have moved +1, +1
    // Original position was around (10-12, 10-12)
    // New position should be around (11-13, 11-13)
    // The exact pattern is the same, just shifted diagonally

    // Verify at least one cell moved (not stuck as a static block)
    let original_alive: Vec<usize> = initial_cells
        .iter()
        .map(|&(x, y)| coord_to_index(x, y))
        .collect();

    let current_alive: Vec<usize> = (0..TOTAL_CELLS)
        .filter(|&idx| is_alive(grid[idx]))
        .collect();

    // The sets should be DIFFERENT (glider moved)
    let original_set: std::collections::HashSet<_> = original_alive.iter().collect();
    let current_set: std::collections::HashSet<_> = current_alive.iter().collect();

    assert_ne!(
        original_set, current_set,
        "Glider should have moved after 4 generations!"
    );
}
