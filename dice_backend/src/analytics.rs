use crate::types::{DetailedGameHistory, RollDirection, E8S_PER_ICP};
use crate::game::GAME_HISTORY;

// =============================================================================
// ANALYTICS FUNCTIONS
// =============================================================================

// Get detailed history with formatted data
pub fn get_detailed_history(limit: u32) -> Vec<DetailedGameHistory> {
    GAME_HISTORY.with(|history| {
        let history = history.borrow();
        history
            .iter()
            .rev()
            .take(limit as usize)
            .map(|(game_id, game)| {
                DetailedGameHistory {
                    game_id,
                    player: game.player.to_text(),
                    bet_icp: (game.bet_amount as f64 / E8S_PER_ICP as f64),
                    won_icp: if game.is_win { game.payout as f64 / E8S_PER_ICP as f64 } else { 0.0 },
                    target_number: game.target_number,
                    direction: match game.direction {
                        RollDirection::Over => "Over".to_string(),
                        RollDirection::Under => "Under".to_string(),
                    },
                    rolled_number: game.rolled_number,
                    win_chance: game.win_chance * 100.0,  // Convert to percentage
                    multiplier: game.multiplier,
                    is_win: game.is_win,
                    timestamp: game.timestamp,
                    // For debugging/analysis
                    profit_loss: if game.is_win {
                        game.payout as i64 - game.bet_amount as i64
                    } else {
                        -(game.bet_amount as i64)
                    },
                    expected_value: (game.win_chance * game.payout as f64) - game.bet_amount as f64,
                    house_edge_actual: if game.is_win {
                        -(1.0 - (game.bet_amount as f64 / game.payout as f64))
                    } else {
                        1.0
                    },
                }
            })
            .collect()
    })
}

// Export history as CSV for analysis
pub fn export_history_csv(limit: u32) -> String {
    let history = get_detailed_history(limit);

    let mut csv = String::from("game_id,player,bet_icp,won_icp,target,direction,rolled,win_chance_%,multiplier,is_win,profit_loss_e8s,timestamp\n");

    for game in history {
        csv.push_str(&format!(
            "{},{},{:.4},{:.4},{},{},{},{:.2},{:.2},{},{},{}\n",
            game.game_id,
            game.player,
            game.bet_icp,
            game.won_icp,
            game.target_number,
            game.direction,
            game.rolled_number,
            game.win_chance,
            game.multiplier,
            game.is_win,
            game.profit_loss,
            game.timestamp
        ));
    }

    csv
}
