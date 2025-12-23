//! Benchmarking module for cycle consumption tracking
//!
//! Tracks cycle usage across different operations to identify performance issues.

use candid::CandidType;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;

/// Maximum number of samples to keep per operation
const MAX_SAMPLES: usize = 100;

/// Benchmark data for a single operation type
#[derive(Clone, Default, CandidType, Deserialize, Serialize)]
pub struct OperationStats {
    /// Total number of times this operation was called
    pub call_count: u64,
    /// Total cycles consumed by this operation
    pub total_cycles: u64,
    /// Minimum cycles for a single call
    pub min_cycles: u64,
    /// Maximum cycles for a single call
    pub max_cycles: u64,
    /// Recent samples for analysis (circular buffer)
    pub recent_samples: Vec<u64>,
    /// Index for circular buffer
    sample_index: usize,
}

impl OperationStats {
    pub fn new() -> Self {
        Self {
            call_count: 0,
            total_cycles: 0,
            min_cycles: u64::MAX,
            max_cycles: 0,
            recent_samples: Vec::with_capacity(MAX_SAMPLES),
            sample_index: 0,
        }
    }

    pub fn record(&mut self, cycles: u64) {
        self.call_count += 1;
        self.total_cycles += cycles;
        self.min_cycles = self.min_cycles.min(cycles);
        self.max_cycles = self.max_cycles.max(cycles);

        // Circular buffer for recent samples
        if self.recent_samples.len() < MAX_SAMPLES {
            self.recent_samples.push(cycles);
        } else {
            self.recent_samples[self.sample_index] = cycles;
            self.sample_index = (self.sample_index + 1) % MAX_SAMPLES;
        }
    }

    pub fn average(&self) -> u64 {
        if self.call_count == 0 {
            0
        } else {
            self.total_cycles / self.call_count
        }
    }

    pub fn recent_average(&self) -> u64 {
        if self.recent_samples.is_empty() {
            0
        } else {
            self.recent_samples.iter().sum::<u64>() / self.recent_samples.len() as u64
        }
    }
}

/// All tracked operations
#[derive(Clone, Default, CandidType, Deserialize, Serialize)]
pub struct BenchmarkData {
    /// Full tick (10 generations + wipe check + grace check)
    pub tick: OperationStats,
    /// Single generation step
    pub step_generation: OperationStats,
    /// Computing cell fates
    pub compute_fates: OperationStats,
    /// Applying changes (births/deaths)
    pub apply_changes: OperationStats,
    /// Disconnection checks
    pub disconnection_check: OperationStats,
    /// Quadrant wipe
    pub wipe_quadrant: OperationStats,
    /// Timer callback overhead
    pub timer_callback: OperationStats,
    /// Place cells operation
    pub place_cells: OperationStats,
    /// Join game operation
    pub join_game: OperationStats,
    /// Get state query
    pub get_state: OperationStats,
    /// Timestamp of last reset
    pub last_reset_ns: u64,
    /// Total time tracked (nanoseconds)
    pub tracking_duration_ns: u64,
}

impl BenchmarkData {
    pub fn new() -> Self {
        Self {
            tick: OperationStats::new(),
            step_generation: OperationStats::new(),
            compute_fates: OperationStats::new(),
            apply_changes: OperationStats::new(),
            disconnection_check: OperationStats::new(),
            wipe_quadrant: OperationStats::new(),
            timer_callback: OperationStats::new(),
            place_cells: OperationStats::new(),
            join_game: OperationStats::new(),
            get_state: OperationStats::new(),
            last_reset_ns: 0,
            tracking_duration_ns: 0,
        }
    }

    pub fn reset(&mut self, now_ns: u64) {
        *self = Self::new();
        self.last_reset_ns = now_ns;
    }
}

/// Summary report for easy viewing
#[derive(Clone, CandidType, Deserialize, Serialize)]
pub struct BenchmarkReport {
    pub tracking_hours: f64,
    pub total_ticks: u64,
    pub total_generations: u64,
    pub cycles_per_tick_avg: u64,
    pub cycles_per_generation_avg: u64,
    pub cycles_per_day_estimated: u64,
    pub cycles_per_day_breakdown: CycleBreakdown,
    pub idle_burn_rate: IdleBurnInfo,
}

#[derive(Clone, CandidType, Deserialize, Serialize)]
pub struct CycleBreakdown {
    pub tick_total: u64,
    pub compute_fates: u64,
    pub apply_changes: u64,
    pub disconnection: u64,
    pub wipe: u64,
    pub timer_overhead: u64,
}

#[derive(Clone, CandidType, Deserialize, Serialize)]
pub struct IdleBurnInfo {
    /// Estimated cycles burned per day at current rate
    pub estimated_daily_cycles: u64,
    /// How many of those are from timer alone
    pub timer_cycles_per_day: u64,
    /// Potential savings if timer stopped when idle
    pub potential_savings: u64,
    /// Is the game currently idle (no alive cells)?
    pub is_idle: bool,
    /// Number of alive cells
    pub alive_cell_count: u32,
}

thread_local! {
    static BENCHMARKS: RefCell<BenchmarkData> = RefCell::new(BenchmarkData::new());
}

/// Get current instruction count (cycles approximation)
#[inline]
pub fn get_instructions() -> u64 {
    #[cfg(target_arch = "wasm32")]
    {
        // ic0.performance_counter(0) returns instruction count
        unsafe { ic0::performance_counter(0) }
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        0 // Return 0 for non-wasm builds (testing)
    }
}

/// RAII guard for measuring operation cycles
pub struct BenchmarkGuard {
    start: u64,
    operation: BenchmarkOperation,
}

#[derive(Clone, Copy)]
pub enum BenchmarkOperation {
    Tick,
    StepGeneration,
    ComputeFates,
    ApplyChanges,
    DisconnectionCheck,
    WipeQuadrant,
    TimerCallback,
    PlaceCells,
    JoinGame,
    GetState,
}

impl BenchmarkGuard {
    pub fn new(operation: BenchmarkOperation) -> Self {
        Self {
            start: get_instructions(),
            operation,
        }
    }
}

impl Drop for BenchmarkGuard {
    fn drop(&mut self) {
        let elapsed = get_instructions().saturating_sub(self.start);
        BENCHMARKS.with(|b| {
            let mut b = b.borrow_mut();
            match self.operation {
                BenchmarkOperation::Tick => b.tick.record(elapsed),
                BenchmarkOperation::StepGeneration => b.step_generation.record(elapsed),
                BenchmarkOperation::ComputeFates => b.compute_fates.record(elapsed),
                BenchmarkOperation::ApplyChanges => b.apply_changes.record(elapsed),
                BenchmarkOperation::DisconnectionCheck => b.disconnection_check.record(elapsed),
                BenchmarkOperation::WipeQuadrant => b.wipe_quadrant.record(elapsed),
                BenchmarkOperation::TimerCallback => b.timer_callback.record(elapsed),
                BenchmarkOperation::PlaceCells => b.place_cells.record(elapsed),
                BenchmarkOperation::JoinGame => b.join_game.record(elapsed),
                BenchmarkOperation::GetState => b.get_state.record(elapsed),
            }
        });
    }
}

/// Convenience macros for benchmarking
#[macro_export]
macro_rules! benchmark {
    ($op:ident) => {
        let _guard = $crate::benchmarks::BenchmarkGuard::new(
            $crate::benchmarks::BenchmarkOperation::$op
        );
    };
}

// ============================================================================
// Candid-exposed query/update functions
// ============================================================================

#[ic_cdk::query]
pub fn get_benchmarks() -> BenchmarkData {
    BENCHMARKS.with(|b| b.borrow().clone())
}

#[ic_cdk::query]
pub fn get_benchmark_report() -> BenchmarkReport {
    let alive_cell_count = crate::get_alive_cell_count();

    BENCHMARKS.with(|b| {
        let b = b.borrow();
        let now = ic_cdk::api::time();
        let duration_ns = now.saturating_sub(b.last_reset_ns);
        let duration_hours = duration_ns as f64 / 3_600_000_000_000.0;

        const TICKS_PER_DAY: u64 = 86_400;
        const GENERATIONS_PER_DAY: u64 = 864_000;

        let cycles_per_tick = b.tick.average();
        let cycles_per_gen = b.step_generation.average();
        let daily_from_ticks = cycles_per_tick * TICKS_PER_DAY;

        let breakdown = CycleBreakdown {
            tick_total: daily_from_ticks,
            compute_fates: b.compute_fates.average() * GENERATIONS_PER_DAY,
            apply_changes: b.apply_changes.average() * GENERATIONS_PER_DAY,
            disconnection: b.disconnection_check.average() * GENERATIONS_PER_DAY,
            wipe: b.wipe_quadrant.average() * 288,
            timer_overhead: b.timer_callback.average() * TICKS_PER_DAY,
        };

        let is_idle = alive_cell_count == 0;
        let timer_daily = b.timer_callback.average() * TICKS_PER_DAY;

        BenchmarkReport {
            tracking_hours: duration_hours,
            total_ticks: b.tick.call_count,
            total_generations: b.step_generation.call_count,
            cycles_per_tick_avg: cycles_per_tick,
            cycles_per_generation_avg: cycles_per_gen,
            cycles_per_day_estimated: daily_from_ticks,
            cycles_per_day_breakdown: breakdown,
            idle_burn_rate: IdleBurnInfo {
                estimated_daily_cycles: daily_from_ticks,
                timer_cycles_per_day: timer_daily,
                potential_savings: if is_idle { daily_from_ticks } else { 0 },
                is_idle,
                alive_cell_count,
            },
        }
    })
}

#[ic_cdk::update]
pub fn reset_benchmarks() {
    BENCHMARKS.with(|b| {
        b.borrow_mut().reset(ic_cdk::api::time());
    });
}

// External IC API for wasm32
#[cfg(target_arch = "wasm32")]
mod ic0 {
    #[link(wasm_import_module = "ic0")]
    extern "C" {
        pub fn performance_counter(counter_type: u32) -> u64;
    }
}
