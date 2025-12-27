use super::*;

/// Reference implementation using individual bit extraction (the old approach)
fn count_neighbors_reference(
    bit_pos: usize,
    above: u64, same: u64, below: u64,
    left_above: u64, left_same: u64, left_below: u64,
    right_above: u64, right_same: u64, right_below: u64,
) -> u8 {
    let (nw, n, ne, w, e, sw, s, se) = if bit_pos == 0 {
        (
            ((left_above >> 63) & 1) as u8,
            ((above >> 0) & 1) as u8,
            ((above >> 1) & 1) as u8,
            ((left_same >> 63) & 1) as u8,
            ((same >> 1) & 1) as u8,
            ((left_below >> 63) & 1) as u8,
            ((below >> 0) & 1) as u8,
            ((below >> 1) & 1) as u8,
        )
    } else if bit_pos == 63 {
        (
            ((above >> 62) & 1) as u8,
            ((above >> 63) & 1) as u8,
            ((right_above >> 0) & 1) as u8,
            ((same >> 62) & 1) as u8,
            ((right_same >> 0) & 1) as u8,
            ((below >> 62) & 1) as u8,
            ((below >> 63) & 1) as u8,
            ((right_below >> 0) & 1) as u8,
        )
    } else {
        (
            ((above >> (bit_pos - 1)) & 1) as u8,
            ((above >> bit_pos) & 1) as u8,
            ((above >> (bit_pos + 1)) & 1) as u8,
            ((same >> (bit_pos - 1)) & 1) as u8,
            ((same >> (bit_pos + 1)) & 1) as u8,
            ((below >> (bit_pos - 1)) & 1) as u8,
            ((below >> bit_pos) & 1) as u8,
            ((below >> (bit_pos + 1)) & 1) as u8,
        )
    };
    nw + n + ne + w + e + sw + s + se
}

#[test]
fn test_popcount_matches_reference_all_positions() {
    let patterns: [u64; 8] = [
        0u64, !0u64, 0xAAAAAAAAAAAAAAAA, 0x5555555555555555,
        0xFF00FF00FF00FF00, 0x00FF00FF00FF00FF,
        0x8000000000000001, 0x7FFFFFFFFFFFFFFE,
    ];

    for bit_pos in 0..64 {
        for &above in &patterns {
            for &same in &patterns {
                for &below in &patterns {
                    let left_above = above.rotate_left(1);
                    let left_same = same.rotate_left(1);
                    let left_below = below.rotate_left(1);
                    let right_above = above.rotate_right(1);
                    let right_same = same.rotate_right(1);
                    let right_below = below.rotate_right(1);

                    let reference = count_neighbors_reference(
                        bit_pos, above, same, below,
                        left_above, left_same, left_below,
                        right_above, right_same, right_below,
                    );
                    let popcount = count_neighbors_popcount(
                        bit_pos, above, same, below,
                        left_above, left_same, left_below,
                        right_above, right_same, right_below,
                    );

                    assert_eq!(reference, popcount,
                        "Mismatch at bit_pos={}, above={:#x}", bit_pos, above);
                }
            }
        }
    }
}

#[test]
fn test_popcount_edge_bit0() {
    let above = 0b111u64;   // N(bit0), NE(bit1) set
    let same = 0b010u64;    // E(bit1) set
    let below = 0b111u64;   // S(bit0), SE(bit1) set
    let left_above = 1u64 << 63;  // NW neighbor
    let left_same = 1u64 << 63;   // W neighbor
    let left_below = 1u64 << 63;  // SW neighbor

    let count = count_neighbors_popcount(0, above, same, below, left_above, left_same, left_below, 0, 0, 0);
    // NW(1) + N(1) + NE(1) + W(1) + E(1) + SW(1) + S(1) + SE(1) = 8
    assert_eq!(count, 8);
}

#[test]
fn test_popcount_edge_bit63() {
    let above = 0b11u64 << 62;
    let below = 0b11u64 << 62;
    let right_above = 1u64;
    let right_same = 1u64;
    let right_below = 1u64;

    let count = count_neighbors_popcount(63, above, 0, below, 0, 0, 0, right_above, right_same, right_below);
    assert_eq!(count, 7);
}

#[test]
fn test_popcount_interior() {
    let above = 0b111u64 << 31;
    let same = 0b101u64 << 31;
    let below = 0b111u64 << 31;

    let count = count_neighbors_popcount(32, above, same, below, 0, 0, 0, 0, 0, 0);
    assert_eq!(count, 8);
}

#[test]
fn test_extract_matches_popcount() {
    for bit_pos in [0, 1, 31, 32, 62, 63] {
        let above = 0xAAAAAAAAAAAAAAAAu64;
        let same = 0x5555555555555555u64;
        let below = 0xFFFFFFFFFFFFFFFFu64;
        let left_above = above.rotate_left(1);
        let left_same = same.rotate_left(1);
        let left_below = below.rotate_left(1);
        let right_above = above.rotate_right(1);
        let right_same = same.rotate_right(1);
        let right_below = below.rotate_right(1);

        let (nw, n, ne, w, e, sw, s, se) = extract_neighbor_bits(
            bit_pos, above, same, below,
            left_above, left_same, left_below,
            right_above, right_same, right_below,
        );
        let sum = nw + n + ne + w + e + sw + s + se;
        let popcount = count_neighbors_popcount(
            bit_pos, above, same, below,
            left_above, left_same, left_below,
            right_above, right_same, right_below,
        );

        assert_eq!(sum, popcount, "Mismatch at bit_pos={}", bit_pos);
    }
}

// =============================================================================
// COORDINATE WRAPPING TESTS
// =============================================================================

#[test]
fn test_coords_to_idx_basic() {
    // Origin
    assert_eq!(coords_to_idx(0, 0), 0);
    // First row
    assert_eq!(coords_to_idx(1, 0), 1);
    assert_eq!(coords_to_idx(511, 0), 511);
    // Second row starts at 512
    assert_eq!(coords_to_idx(0, 1), 512);
    assert_eq!(coords_to_idx(1, 1), 513);
    // Last cell
    assert_eq!(coords_to_idx(511, 511), 512 * 512 - 1);
}

#[test]
fn test_idx_to_coords_basic() {
    assert_eq!(idx_to_coords(0), (0, 0));
    assert_eq!(idx_to_coords(1), (1, 0));
    assert_eq!(idx_to_coords(511), (511, 0));
    assert_eq!(idx_to_coords(512), (0, 1));
    assert_eq!(idx_to_coords(513), (1, 1));
    assert_eq!(idx_to_coords(512 * 512 - 1), (511, 511));
}

#[test]
fn test_coords_idx_roundtrip() {
    // Test all corners
    for (x, y) in [(0, 0), (511, 0), (0, 511), (511, 511)] {
        let idx = coords_to_idx(x, y);
        let (rx, ry) = idx_to_coords(idx);
        assert_eq!((x, y), (rx, ry), "Roundtrip failed for ({}, {})", x, y);
    }

    // Test some random points
    for (x, y) in [(100, 200), (255, 255), (1, 510), (510, 1)] {
        let idx = coords_to_idx(x, y);
        let (rx, ry) = idx_to_coords(idx);
        assert_eq!((x, y), (rx, ry), "Roundtrip failed for ({}, {})", x, y);
    }
}

#[test]
fn test_wrap_word_left_interior() {
    // Interior words should just decrement
    assert_eq!(wrap_word_left(1), 0);
    assert_eq!(wrap_word_left(5), 4);
    assert_eq!(wrap_word_left(100), 99);
}

#[test]
fn test_wrap_word_left_row_boundaries() {
    // At start of each row, should wrap to end of same row
    // Row 0: words 0-7, word 0 wraps to word 7
    assert_eq!(wrap_word_left(0), 7);
    // Row 1: words 8-15, word 8 wraps to word 15
    assert_eq!(wrap_word_left(8), 15);
    // Row 2: words 16-23, word 16 wraps to word 23
    assert_eq!(wrap_word_left(16), 23);
    // Last row: words 4088-4095, word 4088 wraps to 4095
    assert_eq!(wrap_word_left(4088), 4095);
}

#[test]
fn test_wrap_word_right_interior() {
    // Interior words should just increment
    assert_eq!(wrap_word_right(0), 1);
    assert_eq!(wrap_word_right(5), 6);
    assert_eq!(wrap_word_right(100), 101);
}

#[test]
fn test_wrap_word_right_row_boundaries() {
    // At end of each row, should wrap to start of same row
    // Row 0: words 0-7, word 7 wraps to word 0
    assert_eq!(wrap_word_right(7), 0);
    // Row 1: words 8-15, word 15 wraps to word 8
    assert_eq!(wrap_word_right(15), 8);
    // Row 2: words 16-23, word 23 wraps to word 16
    assert_eq!(wrap_word_right(23), 16);
    // Last row: word 4095 wraps to 4088
    assert_eq!(wrap_word_right(4095), 4088);
}

#[test]
fn test_orthogonal_neighbors_interior() {
    // Interior point - no wrapping needed
    let neighbors = orthogonal_neighbors(100, 100);
    assert_eq!(neighbors[0], (99, 100));   // West
    assert_eq!(neighbors[1], (101, 100));  // East
    assert_eq!(neighbors[2], (100, 99));   // North
    assert_eq!(neighbors[3], (100, 101));  // South
}

#[test]
fn test_orthogonal_neighbors_left_edge() {
    // x=0: West neighbor should wrap to x=511
    let neighbors = orthogonal_neighbors(0, 100);
    assert_eq!(neighbors[0], (511, 100));  // West wraps
    assert_eq!(neighbors[1], (1, 100));    // East normal
    assert_eq!(neighbors[2], (0, 99));     // North normal
    assert_eq!(neighbors[3], (0, 101));    // South normal
}

#[test]
fn test_orthogonal_neighbors_right_edge() {
    // x=511: East neighbor should wrap to x=0
    let neighbors = orthogonal_neighbors(511, 100);
    assert_eq!(neighbors[0], (510, 100));  // West normal
    assert_eq!(neighbors[1], (0, 100));    // East wraps
    assert_eq!(neighbors[2], (511, 99));   // North normal
    assert_eq!(neighbors[3], (511, 101));  // South normal
}

#[test]
fn test_orthogonal_neighbors_top_edge() {
    // y=0: North neighbor should wrap to y=511
    let neighbors = orthogonal_neighbors(100, 0);
    assert_eq!(neighbors[0], (99, 0));     // West normal
    assert_eq!(neighbors[1], (101, 0));    // East normal
    assert_eq!(neighbors[2], (100, 511));  // North wraps
    assert_eq!(neighbors[3], (100, 1));    // South normal
}

#[test]
fn test_orthogonal_neighbors_bottom_edge() {
    // y=511: South neighbor should wrap to y=0
    let neighbors = orthogonal_neighbors(100, 511);
    assert_eq!(neighbors[0], (99, 511));   // West normal
    assert_eq!(neighbors[1], (101, 511));  // East normal
    assert_eq!(neighbors[2], (100, 510));  // North normal
    assert_eq!(neighbors[3], (100, 0));    // South wraps
}

#[test]
fn test_orthogonal_neighbors_corner_top_left() {
    // (0, 0): Both West and North should wrap
    let neighbors = orthogonal_neighbors(0, 0);
    assert_eq!(neighbors[0], (511, 0));    // West wraps
    assert_eq!(neighbors[1], (1, 0));      // East normal
    assert_eq!(neighbors[2], (0, 511));    // North wraps
    assert_eq!(neighbors[3], (0, 1));      // South normal
}

#[test]
fn test_orthogonal_neighbors_corner_bottom_right() {
    // (511, 511): Both East and South should wrap
    let neighbors = orthogonal_neighbors(511, 511);
    assert_eq!(neighbors[0], (510, 511));  // West normal
    assert_eq!(neighbors[1], (0, 511));    // East wraps
    assert_eq!(neighbors[2], (511, 510));  // North normal
    assert_eq!(neighbors[3], (511, 0));    // South wraps
}
