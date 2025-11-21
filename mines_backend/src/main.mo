import Random "mo:base/Random";
import Blob "mo:base/Blob";
import Array "mo:base/Array";
import Nat8 "mo:base/Nat8";
import Float "mo:base/Float";
import Result "mo:base/Result";
import Debug "mo:base/Debug";

actor PlinkoV2Motoko {
    // Constants
    private let ROWS : Nat8 = 8;
    private let MAX_BALLS : Nat8 = 10;

    // Type definitions matching Rust implementation
    public type PlinkoResult = {
        path : [Bool];           // true = right, false = left
        final_position : Nat8;   // 0 to 8
        multiplier : Float;      // Calculated from formula
        win : Bool;              // true if multiplier >= 1.0
    };

    public type MultiBallResult = {
        balls : [PlinkoResult];      // Individual ball results
        total_multiplier : Float;     // Sum of all multipliers
        average_multiplier : Float;   // Average across balls
        ball_count : Nat8;            // Number of balls dropped
    };

    // System lifecycle hooks
    system func preupgrade() {
        Debug.print("Plinko V2 (Motoko): Pre-upgrade");
        // Stateless - no data to preserve
    };

    system func postupgrade() {
        Debug.print("Plinko V2 (Motoko): Post-upgrade");
        // Stateless - no data to restore
    };

    // ============ PUBLIC API ============

    /// Drop a single ball down the 8-row Plinko board
    public func drop_ball() : async Result.Result<PlinkoResult, Text> {
        // Get random blob from IC VRF
        let entropy = await Random.blob();

        // Extract first byte for randomness
        let bytes = Blob.toArray(entropy);
        if (bytes.size() < 1) {
            return #err("Insufficient randomness");
        };

        let random_byte = bytes[0];

        // Generate path: 8 coin flips from bits
        let path = Array.tabulate<Bool>(
            Nat8.toNat(ROWS),
            func(i : Nat) : Bool {
                let bit_index = Nat8.fromNat(i);
                ((random_byte >> bit_index) & 1) == 1
            }
        );

        // Count rights to get final position
        var position : Nat8 = 0;
        for (direction in path.vals()) {
            if (direction) { position += 1; };
        };

        // Calculate multiplier using formula
        let multiplier = calculate_multiplier(position);
        let win = multiplier >= 1.0;

        #ok({
            path = path;
            final_position = position;
            multiplier = multiplier;
            win = win;
        })
    };

    /// Drop multiple balls (1-10) down the Plinko board
    public func drop_balls(num_balls : Nat8) : async Result.Result<MultiBallResult, Text> {
        // Validate input
        if (num_balls < 1 or num_balls > MAX_BALLS) {
            return #err("Number of balls must be between 1 and 10");
        };

        // Get random entropy for all balls
        let entropy = await Random.blob();
        let bytes = Blob.toArray(entropy);

        if (bytes.size() < Nat8.toNat(num_balls)) {
            return #err("Insufficient randomness");
        };

        // Process each ball
        var balls : [PlinkoResult] = [];
        var total_multiplier : Float = 0.0;

        for (ball_index in Array.tabulate<Nat>(Nat8.toNat(num_balls), func(i) = i).vals()) {
            let random_byte = bytes[ball_index];

            // Generate path for this ball
            let path = Array.tabulate<Bool>(
                Nat8.toNat(ROWS),
                func(i : Nat) : Bool {
                    ((random_byte >> Nat8.fromNat(i)) & 1) == 1
                }
            );

            // Calculate position
            var position : Nat8 = 0;
            for (dir in path.vals()) {
                if (dir) { position += 1; };
            };

            // Calculate multiplier
            let multiplier = calculate_multiplier(position);

            // Create result
            let result : PlinkoResult = {
                path = path;
                final_position = position;
                multiplier = multiplier;
                win = multiplier >= 1.0;
            };

            balls := Array.append(balls, [result]);
            total_multiplier += multiplier;
        };

        let average_multiplier = total_multiplier / Float.fromInt(Nat8.toNat(num_balls));

        #ok({
            balls = balls;
            total_multiplier = total_multiplier;
            average_multiplier = average_multiplier;
            ball_count = num_balls;
        })
    };

    /// Get all 9 multipliers (positions 0-8)
    public query func get_multipliers() : async [Float] {
        Array.tabulate<Float>(9, func(i) = calculate_multiplier(Nat8.fromNat(i)))
    };

    /// Get the mathematical formula as text
    public query func get_formula() : async Text {
        "M(k) = 0.2 + 6.32 × ((k - 4) / 4)²"
    };

    /// Get expected value (should be 0.99 for 1% house edge)
    public query func get_expected_value() : async Float {
        // Binomial coefficients for 8 rows: C(8,k)
        let coefficients : [Nat] = [1, 8, 28, 56, 70, 56, 28, 8, 1];
        let total_paths : Float = 256.0;

        var expected_value : Float = 0.0;

        for (i in coefficients.keys()) {
            let probability = Float.fromInt(coefficients[i]) / total_paths;
            let multiplier = calculate_multiplier(Nat8.fromNat(i));
            expected_value += probability * multiplier;
        };

        expected_value
    };

    /// Test/greet function
    public query func greet(name : Text) : async Text {
        "Pure Mathematical Plinko V2 (Motoko): Transparent odds, " # name # " wins or loses fairly!"
    };

    // ============ PRIVATE HELPERS ============

    /// Calculate multiplier using pure mathematical formula
    /// M(k) = 0.2 + 6.32 × ((k - 4) / 4)²
    ///
    /// This creates a quadratic distribution where:
    /// - Center (k=4) has minimum multiplier 0.2 (80% loss)
    /// - Edges (k=0,8) have maximum multiplier 6.52 (big win)
    /// - Expected value is exactly 0.99 (1% house edge)
    private func calculate_multiplier(position : Nat8) : Float {
        // Validate position
        if (position > 8) {
            return 0.0;  // Invalid position
        };

        let k = Float.fromInt(Nat8.toNat(position));
        let center = 4.0;
        let distance = Float.abs(k - center);
        let normalized = distance / 4.0;

        // Quadratic formula
        0.2 + 6.32 * normalized * normalized
    };
}
