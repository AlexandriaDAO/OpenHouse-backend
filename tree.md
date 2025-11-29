# OpenHouse Casino - Project Structure

Generated on: 2025-11-29T13:32:22.861Z

```
├── blackjack_backend/
│   ├── Cargo.toml (19 lines)
│   ├── blackjack_backend.did (155 lines)
│   └── src/
│       ├── defi_accounting/
│       │   ├── ARCHITECTURE.md (797 lines)
│       │   ├── CLAUDE.md (68 lines)
│       │   ├── accounting.rs (672 lines)
│       │   ├── audits/
│       │   │   ├── AUDIT_PLAN_V4.md (323 lines)
│       │   │   ├── claude_audit_v1.md (1205 lines)
│       │   │   ├── claude_audit_v2.md (1 lines)
│       │   │   ├── claude_audit_v3.md (793 lines)
│       │   │   ├── gemini_audit_v1.md (195 lines)
│       │   │   ├── gemini_audit_v2.md (116 lines)
│       │   │   ├── gemini_audit_v3.md (167 lines)
│       │   │   └── gemini_audit_v4.md (117 lines)
│       │   ├── liquidity_pool.rs (675 lines)
│       │   ├── memory_ids.rs (63 lines)
│       │   ├── mod.rs (31 lines)
│       │   ├── query.rs (51 lines)
│       │   ├── statistics/
│       │   │   ├── collector.rs (160 lines)
│       │   │   ├── mod.rs (30 lines)
│       │   │   ├── queries.rs (144 lines)
│       │   │   ├── storage.rs (23 lines)
│       │   │   └── types.rs (106 lines)
│       │   ├── tests/
│       │   │   ├── mod.rs (3 lines)
│       │   │   ├── stress_tests/
│       │   │   │   ├── generators.rs (58 lines)
│       │   │   │   ├── mod.rs (8 lines)
│       │   │   │   ├── model.rs (334 lines)
│       │   │   │   ├── operations.rs (25 lines)
│       │   │   │   └── tests.rs (621 lines)
│       │   │   ├── test_serialization.rs (73 lines)
│       │   │   └── test_slippage_audit.rs (130 lines)
│       │   └── types.rs (126 lines)
│       ├── game.rs (562 lines)
│       ├── lib.rs (223 lines)
│       ├── seed.rs (266 lines)
│       └── types.rs (246 lines)
├── crash_backend/
│   ├── Cargo.toml (17 lines)
│   ├── crash_backend.did (36 lines)
│   └── src/
│       └── lib.rs (581 lines)
├── dice_backend/
│   ├── Cargo.toml (25 lines)
│   ├── dice_backend.did (105 lines)
│   ├── src/
│   │   ├── defi_accounting/
│   │   │   ├── ARCHITECTURE.md (797 lines)
│   │   │   ├── CLAUDE.md (68 lines)
│   │   │   ├── accounting.rs (672 lines)
│   │   │   ├── audits/
│   │   │   │   ├── AUDIT_PLAN_V4.md (323 lines)
│   │   │   │   ├── claude_audit_v1.md (1205 lines)
│   │   │   │   ├── claude_audit_v2.md (1 lines)
│   │   │   │   ├── claude_audit_v3.md (793 lines)
│   │   │   │   ├── gemini_audit_v1.md (195 lines)
│   │   │   │   ├── gemini_audit_v2.md (116 lines)
│   │   │   │   ├── gemini_audit_v3.md (167 lines)
│   │   │   │   └── gemini_audit_v4.md (117 lines)
│   │   │   ├── liquidity_pool.rs (675 lines)
│   │   │   ├── memory_ids.rs (63 lines)
│   │   │   ├── mod.rs (31 lines)
│   │   │   ├── query.rs (51 lines)
│   │   │   ├── statistics/
│   │   │   │   ├── collector.rs (160 lines)
│   │   │   │   ├── mod.rs (30 lines)
│   │   │   │   ├── queries.rs (144 lines)
│   │   │   │   ├── storage.rs (23 lines)
│   │   │   │   └── types.rs (106 lines)
│   │   │   ├── tests/
│   │   │   │   ├── mod.rs (3 lines)
│   │   │   │   ├── stress_tests/
│   │   │   │   │   ├── generators.rs (58 lines)
│   │   │   │   │   ├── mod.rs (8 lines)
│   │   │   │   │   ├── model.rs (334 lines)
│   │   │   │   │   ├── operations.rs (25 lines)
│   │   │   │   │   └── tests.rs (621 lines)
│   │   │   │   ├── test_serialization.rs (73 lines)
│   │   │   │   └── test_slippage_audit.rs (130 lines)
│   │   │   └── types.rs (126 lines)
│   │   ├── game.rs (212 lines)
│   │   ├── lib.rs (234 lines)
│   │   ├── seed.rs (290 lines)
│   │   └── types.rs (134 lines)
│   └── tests/
│       └── test_game_logic.rs (58 lines)
├── openhouse_frontend/
│   ├── BALANCE_GUIDE.md (183 lines)
│   ├── build-auth.js (16 lines)
│   ├── index.html (25 lines)
│   ├── package.json (35 lines)
│   ├── postcss.config.js (7 lines)
│   ├── public/
│   │   ├── chips/
│   │   │   ├── black_side.png (5518 lines)
│   │   │   ├── black_top.png (2398 lines)
│   │   │   ├── blue_side.png (5568 lines)
│   │   │   ├── blue_top.png (2870 lines)
│   │   │   ├── green_side.png (5730 lines)
│   │   │   ├── green_top.png (10203 lines)
│   │   │   ├── red_side.png (6154 lines)
│   │   │   ├── red_top.png (10690 lines)
│   │   │   ├── white_side.png (6592 lines)
│   │   │   └── white_top.png (6567 lines)
│   │   └── logos/
│   │       ├── logo_icon.png (957 lines)
│   │       ├── logo_whole.png (7097 lines)
│   │       └── logo_with_background.jpg (374 lines)
│   ├── src/
│   │   ├── App.backup.tsx (35 lines)
│   │   ├── App.tsx (41 lines)
│   │   ├── components/
│   │   │   ├── AuthButton.tsx (126 lines)
│   │   │   ├── DiceAnimation.css (103 lines)
│   │   │   ├── DiceAnimation.tsx (123 lines)
│   │   │   ├── GameCard.tsx (49 lines)
│   │   │   ├── InfoTooltip.tsx (31 lines)
│   │   │   ├── Layout.tsx (80 lines)
│   │   │   ├── game-specific/
│   │   │   │   ├── blackjack/
│   │   │   │   │   ├── BlackjackTable.tsx (56 lines)
│   │   │   │   │   ├── Card.tsx (68 lines)
│   │   │   │   │   ├── Hand.tsx (73 lines)
│   │   │   │   │   └── index.ts (4 lines)
│   │   │   │   ├── crash/
│   │   │   │   │   ├── CrashCanvas.tsx (227 lines)
│   │   │   │   │   ├── CrashProbabilityTable.tsx (71 lines)
│   │   │   │   │   ├── CrashRocket.css (75 lines)
│   │   │   │   │   └── index.ts (3 lines)
│   │   │   │   ├── dice/
│   │   │   │   │   ├── ChipBetting.tsx (180 lines)
│   │   │   │   │   ├── ChipStack.tsx (109 lines)
│   │   │   │   │   ├── DiceAccountingPanel.tsx (273 lines)
│   │   │   │   │   ├── DiceAnimation.css (132 lines)
│   │   │   │   │   ├── DiceAnimation.tsx (112 lines)
│   │   │   │   │   ├── DiceControls.tsx (32 lines)
│   │   │   │   │   ├── HealthDashboard.tsx (244 lines)
│   │   │   │   │   ├── chipConfig.ts (110 lines)
│   │   │   │   │   ├── index.ts (10 lines)
│   │   │   │   │   └── statistics/
│   │   │   │   │       ├── DiceStatistics.tsx (146 lines)
│   │   │   │   │       ├── StatsCharts.tsx (185 lines)
│   │   │   │   │       ├── index.ts (2 lines)
│   │   │   │   │       └── useStatsData.ts (87 lines)
│   │   │   │   └── plinko/
│   │   │   │       ├── PlinkoBoard.css (111 lines)
│   │   │   │       ├── PlinkoBoard.tsx (148 lines)
│   │   │   │       ├── PlinkoMultipliers.tsx (57 lines)
│   │   │   │       └── index.ts (5 lines)
│   │   │   ├── game-ui/
│   │   │   │   ├── AuthNotice.tsx (27 lines)
│   │   │   │   ├── BetAmountInput.tsx (97 lines)
│   │   │   │   ├── BettingRail.css (199 lines)
│   │   │   │   ├── BettingRail.tsx (447 lines)
│   │   │   │   ├── ConnectionStatus.tsx (61 lines)
│   │   │   │   ├── GameButton.tsx (67 lines)
│   │   │   │   ├── GameHistory.tsx (69 lines)
│   │   │   │   ├── GameLayout.tsx (50 lines)
│   │   │   │   ├── GameStats.tsx (73 lines)
│   │   │   │   ├── InteractiveChipStack.tsx (128 lines)
│   │   │   │   └── index.ts (14 lines)
│   │   │   └── ui/
│   │   │       └── ConnectionStatus.tsx (196 lines)
│   │   ├── hooks/
│   │   │   ├── actors/
│   │   │   │   ├── useBlackjackActor.ts (14 lines)
│   │   │   │   ├── useCrashActor.ts (14 lines)
│   │   │   │   ├── useDiceActor.ts (14 lines)
│   │   │   │   ├── useLedgerActor.ts (14 lines)
│   │   │   │   └── usePlinkoActor.ts (14 lines)
│   │   │   └── games/
│   │   │       ├── index.ts (5 lines)
│   │   │       ├── useBetValidation.ts (70 lines)
│   │   │       ├── useGameHistory.ts (47 lines)
│   │   │       ├── useGameMode.ts (16 lines)
│   │   │       └── useGameState.ts (106 lines)
│   │   ├── index.css (94 lines)
│   │   ├── main.tsx (11 lines)
│   │   ├── pages/
│   │   │   ├── Blackjack.tsx (279 lines)
│   │   │   ├── Crash.tsx (281 lines)
│   │   │   ├── Dice.tsx (3 lines)
│   │   │   ├── Home.tsx (61 lines)
│   │   │   ├── Plinko.tsx (206 lines)
│   │   │   └── dice/
│   │   │       ├── DiceGame.tsx (416 lines)
│   │   │       ├── DiceLayout.tsx (40 lines)
│   │   │       ├── DiceLiquidity.tsx (377 lines)
│   │   │       └── index.ts (4 lines)
│   │   ├── providers/
│   │   │   ├── ActorProvider.tsx (157 lines)
│   │   │   ├── AuthProvider.tsx (127 lines)
│   │   │   ├── BalanceProvider.tsx (85 lines)
│   │   │   └── GameBalanceProvider.tsx (486 lines)
│   │   ├── types/
│   │   │   ├── balance.ts (93 lines)
│   │   │   ├── dice-backend.ts (119 lines)
│   │   │   └── ledger.ts (66 lines)
│   │   ├── types.ts (20 lines)
│   │   └── utils/
│   │       └── ledgerIdl.ts (56 lines)
│   ├── tailwind.config.js (32 lines)
│   ├── tsconfig.json (33 lines)
│   ├── tsconfig.node.json (11 lines)
│   └── vite.config.ts (34 lines)
├── plinko_backend/
│   ├── Cargo.toml (16 lines)
│   ├── plinko_backend.did (23 lines)
│   └── src/
│       └── lib.rs (399 lines)
└── scripts/
    ├── check_balance.sh (155 lines)
    ├── stress_test_dice.sh (363 lines)
    └── test_concurrent_withdraw.sh (19 lines)

```

## Summary

This tree shows the complete file structure of the OpenHouse Casino project with line counts for each file.

### Key Directories:
- `crash_backend/` - Crash game backend canister
- `plinko_backend/` - Plinko game backend canister
- `blackjack_backend/` - Blackjack game backend canister
- `dice_backend/` - Dice game backend canister
- `openhouse_frontend/` - Multi-game frontend interface
- `scripts/` - Utility scripts

**Note:** Some files and directories are excluded based on hardcoded patterns.
