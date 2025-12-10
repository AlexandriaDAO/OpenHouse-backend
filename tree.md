# OpenHouse Casino - Project Structure

Generated on: 2025-12-06T11:45:43.666Z

```
├── roulette_backend/
│   ├── Cargo.toml (19 lines)
│   ├── roulette_backend.did (155 lines)
│   └── src/
│       ├── game.rs (619 lines)
│       ├── lib.rs (218 lines)
│       ├── seed.rs (266 lines)
│       └── types.rs (331 lines)
├── crash_backend/
│   ├── Cargo.toml (17 lines)
│   ├── crash_backend.did (36 lines)
│   └── src/
│       └── lib.rs (581 lines)
├── dice_backend/
│   ├── Cargo.toml (25 lines)
│   ├── dice_backend.did (196 lines)
│   ├── src/
│   │   ├── defi_accounting/
│   │   │   ├── ARCHITECTURE.md (797 lines)
│   │   │   ├── CLAUDE.md (68 lines)
│   │   │   ├── accounting.rs (779 lines)
│   │   │   ├── admin_query.rs (133 lines)
│   │   │   ├── audits/
│   │   │   │   ├── claude_audit_v1.md (1205 lines)
│   │   │   │   ├── claude_audit_v2.md (1 lines)
│   │   │   │   ├── claude_audit_v3.md (793 lines)
│   │   │   │   ├── claude_audit_v4.md (568 lines)
│   │   │   │   ├── gemini_audit_v1.md (195 lines)
│   │   │   │   ├── gemini_audit_v2.md (116 lines)
│   │   │   │   ├── gemini_audit_v3.md (167 lines)
│   │   │   │   └── gemini_audit_v4.md (137 lines)
│   │   │   ├── liquidity_pool.rs (712 lines)
│   │   │   ├── memory_ids.rs (60 lines)
│   │   │   ├── mod.rs (32 lines)
│   │   │   ├── query.rs (43 lines)
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
│   │   │   └── types.rs (192 lines)
│   │   ├── game.rs (395 lines)
│   │   ├── lib.rs (312 lines)
│   │   ├── seed.rs (147 lines)
│   │   └── types.rs (143 lines)
│   └── tests/
│       └── test_game_logic.rs (58 lines)
├── openhouse_frontend/
│   ├── BALANCE_GUIDE.md (183 lines)
│   ├── build-auth.js (16 lines)
│   ├── index.html (25 lines)
│   ├── package.json (41 lines)
│   ├── postcss.config.js (7 lines)
│   ├── public/
│   │   ├── chips/
│   │   │   ├── optimized/
│   │   │   │   ├── black_side.png (187 lines)
│   │   │   │   ├── black_top.png (315 lines)
│   │   │   │   ├── blue_side.png (163 lines)
│   │   │   │   ├── blue_top.png (269 lines)
│   │   │   │   ├── green_side.png (194 lines)
│   │   │   │   ├── green_top.png (324 lines)
│   │   │   │   ├── red_side.png (214 lines)
│   │   │   │   ├── red_top.png (318 lines)
│   │   │   │   ├── white_side.png (261 lines)
│   │   │   │   └── white_top.png (398 lines)
│   │   │   ├── original/
│   │   │   │   ├── black_side.png (5518 lines)
│   │   │   │   ├── black_top.png (2398 lines)
│   │   │   │   ├── blue_side.png (5568 lines)
│   │   │   │   ├── blue_top.png (2870 lines)
│   │   │   │   ├── green_side.png (5730 lines)
│   │   │   │   ├── green_top.png (10203 lines)
│   │   │   │   ├── red_side.png (6154 lines)
│   │   │   │   ├── red_top.png (10690 lines)
│   │   │   │   ├── white_side.png (6592 lines)
│   │   │   │   └── white_top.png (6567 lines)
│   │   │   └── tinified/
│   │   │       ├── black_side.png (1519 lines)
│   │   │       ├── black_top.png (1081 lines)
│   │   │       ├── blue_side.png (1649 lines)
│   │   │       ├── blue_top.png (1178 lines)
│   │   │       ├── green_side.png (1597 lines)
│   │   │       ├── green_top.png (3046 lines)
│   │   │       ├── red_side.png (1641 lines)
│   │   │       ├── red_top.png (3375 lines)
│   │   │       ├── white_side.png (1747 lines)
│   │   │       └── white_top.png (1960 lines)
│   │   ├── images/
│   │   │   └── ic.svg (29 lines)
│   │   └── logos/
│   │       ├── logo_icon.png (957 lines)
│   │       ├── logo_whole.png (7097 lines)
│   │       └── logo_with_background.jpg (374 lines)
│   ├── src/
│   │   ├── App.backup.tsx (35 lines)
│   │   ├── App.tsx (58 lines)
│   │   ├── components/
│   │   │   ├── AdminRoute.tsx (24 lines)
│   │   │   ├── AuthButton.tsx (100 lines)
│   │   │   ├── AuthMethodSelector.tsx (92 lines)
│   │   │   ├── DiceAnimation.css (103 lines)
│   │   │   ├── DiceAnimation.tsx (123 lines)
│   │   │   ├── GameCard.tsx (60 lines)
│   │   │   ├── InfoTooltip.tsx (35 lines)
│   │   │   ├── Layout.tsx (79 lines)
│   │   │   ├── OnboardingBanner.tsx (144 lines)
│   │   │   ├── WhyOpenHouseModal.tsx (141 lines)
│   │   │   ├── betting/
│   │   │   │   ├── BettingRail.tsx (317 lines)
│   │   │   │   ├── ChipSelector.tsx (51 lines)
│   │   │   │   ├── ChipStack.tsx (204 lines)
│   │   │   │   ├── DepositModal.tsx (116 lines)
│   │   │   │   ├── betting.css (796 lines)
│   │   │   │   ├── chipConfig.ts (110 lines)
│   │   │   │   ├── hooks/
│   │   │   │   │   ├── useBettingState.ts (119 lines)
│   │   │   │   │   └── useDepositFlow.ts (168 lines)
│   │   │   │   ├── index.ts (7 lines)
│   │   │   │   └── types.ts (135 lines)
│   │   │   ├── game-specific/
│   │   │   │   ├── roulette/
│   │   │   │   │   ├── RouletteTable.tsx (56 lines)
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
│   │   │   │   │   ├── DiceAnimation.css (231 lines)
│   │   │   │   │   ├── DiceAnimation.tsx (249 lines)
│   │   │   │   │   ├── DiceControls.tsx (48 lines)
│   │   │   │   │   ├── DiceCountSelector.tsx (58 lines)
│   │   │   │   │   ├── PendingWithdrawalRecovery.tsx (255 lines)
│   │   │   │   │   ├── chipConfig.ts (110 lines)
│   │   │   │   │   ├── index.ts (11 lines)
│   │   │   │   │   └── statistics/
│   │   │   │   │       ├── DiceStatistics.tsx (130 lines)
│   │   │   │   │       ├── StatsCharts.tsx (206 lines)
│   │   │   │   │       ├── index.ts (2 lines)
│   │   │   │   │       ├── useApyData.ts (33 lines)
│   │   │   │   │       └── useStatsData.ts (87 lines)
│   │   │   │   └── plinko/
│   │   │   │       ├── PlinkoController.ts (301 lines)
│   │   │   │       ├── PlinkoStage.tsx (154 lines)
│   │   │   │       ├── index.ts (4 lines)
│   │   │   │       └── pixi/
│   │   │   │           ├── BallRenderer.ts (134 lines)
│   │   │   │           ├── BucketRenderer.ts (289 lines)
│   │   │   │           ├── LayoutConfig.ts (88 lines)
│   │   │   │           ├── PegRenderer.ts (54 lines)
│   │   │   │           ├── SlotRenderer.ts (181 lines)
│   │   │   │           └── index.ts (6 lines)
│   │   │   ├── game-ui/
│   │   │   │   ├── AuthNotice.tsx (27 lines)
│   │   │   │   ├── BetAmountInput.tsx (97 lines)
│   │   │   │   ├── ConnectionStatus.tsx (61 lines)
│   │   │   │   ├── GameButton.tsx (67 lines)
│   │   │   │   ├── GameHistory.tsx (69 lines)
│   │   │   │   ├── GameLayout.tsx (54 lines)
│   │   │   │   ├── GameStats.tsx (73 lines)
│   │   │   │   └── index.ts (13 lines)
│   │   │   ├── liquidity/
│   │   │   │   ├── GameLiquidity.tsx (205 lines)
│   │   │   │   ├── LiquidityActions.tsx (133 lines)
│   │   │   │   ├── LiquidityPosition.tsx (29 lines)
│   │   │   │   ├── LiquidityRiskReturns.tsx (75 lines)
│   │   │   │   ├── LiquidityStatsBar.tsx (58 lines)
│   │   │   │   ├── PendingWithdrawalRecovery.tsx (118 lines)
│   │   │   │   └── index.ts (7 lines)
│   │   │   ├── modals/
│   │   │   │   ├── ErrorModal.tsx (43 lines)
│   │   │   │   ├── LoadingModal.tsx (30 lines)
│   │   │   │   ├── SuccessModal.tsx (43 lines)
│   │   │   │   └── index.ts (4 lines)
│   │   │   ├── statistics/
│   │   │   │   ├── ApyCard.tsx (48 lines)
│   │   │   │   ├── GameStatistics.tsx (166 lines)
│   │   │   │   ├── StatsCharts.tsx (272 lines)
│   │   │   │   └── index.ts (4 lines)
│   │   │   └── ui/
│   │   │       └── ConnectionStatus.tsx (196 lines)
│   │   ├── config/
│   │   │   └── gameRegistry.ts (111 lines)
│   │   ├── hooks/
│   │   │   ├── actors/
│   │   │   │   ├── index.ts (22 lines)
│   │   │   │   ├── useRouletteActor.ts (14 lines)
│   │   │   │   ├── useCrashActor.ts (14 lines)
│   │   │   │   ├── useDiceActor.ts (14 lines)
│   │   │   │   ├── useGameActor.ts (37 lines)
│   │   │   │   ├── useLedgerActor.ts (14 lines)
│   │   │   │   └── usePlinkoActor.ts (14 lines)
│   │   │   ├── games/
│   │   │   │   ├── index.ts (5 lines)
│   │   │   │   ├── useBetValidation.ts (70 lines)
│   │   │   │   ├── useGameHistory.ts (47 lines)
│   │   │   │   ├── useGameMode.ts (16 lines)
│   │   │   │   └── useGameState.ts (106 lines)
│   │   │   └── liquidity/
│   │   │       ├── index.ts (6 lines)
│   │   │       ├── useApyData.ts (34 lines)
│   │   │       ├── useDepositFlow.ts (106 lines)
│   │   │       ├── usePoolStats.ts (58 lines)
│   │   │       ├── useStatsData.ts (73 lines)
│   │   │       └── useWithdrawalFlow.ts (49 lines)
│   │   ├── index.css (513 lines)
│   │   ├── lib/
│   │   │   └── ic-use-identity/
│   │   │       ├── config/
│   │   │       │   └── identityProviders.ts (73 lines)
│   │   │       ├── hooks/
│   │   │       │   ├── useIdentity.ts (43 lines)
│   │   │       │   └── useInternetIdentity.ts (78 lines)
│   │   │       ├── index.tsx (18 lines)
│   │   │       ├── init.tsx (173 lines)
│   │   │       ├── store/
│   │   │       │   ├── accessors.ts (32 lines)
│   │   │       │   ├── index.ts (35 lines)
│   │   │       │   └── mutators.ts (28 lines)
│   │   │       └── types.ts (22 lines)
│   │   ├── main.tsx (11 lines)
│   │   ├── pages/
│   │   │   ├── Admin.tsx (725 lines)
│   │   │   ├── Crash.tsx (281 lines)
│   │   │   ├── Dice.tsx (3 lines)
│   │   │   ├── Home.tsx (64 lines)
│   │   │   ├── Wallet.tsx (472 lines)
│   │   │   ├── roulette/
│   │   │   │   ├── RouletteGame.tsx (281 lines)
│   │   │   │   ├── RouletteLayout.tsx (15 lines)
│   │   │   │   ├── RouletteLiquidity.tsx (6 lines)
│   │   │   │   └── index.ts (4 lines)
│   │   │   ├── dice/
│   │   │   │   ├── DiceGame.tsx (470 lines)
│   │   │   │   ├── DiceLayout.tsx (15 lines)
│   │   │   │   ├── DiceLiquidity.tsx (6 lines)
│   │   │   │   └── index.ts (4 lines)
│   │   │   └── plinko/
│   │   │       ├── CLAUDE.md (67 lines)
│   │   │       ├── PlinkoGame.tsx (482 lines)
│   │   │       ├── PlinkoLayout.tsx (15 lines)
│   │   │       ├── PlinkoLiquidity.tsx (6 lines)
│   │   │       └── index.ts (4 lines)
│   │   ├── providers/
│   │   │   ├── ActorProvider.tsx (219 lines)
│   │   │   ├── AuthProvider.tsx (55 lines)
│   │   │   ├── BalanceProvider.tsx (85 lines)
│   │   │   └── GameBalanceProvider.tsx (544 lines)
│   │   ├── types/
│   │   │   ├── balance.ts (95 lines)
│   │   │   ├── dice-backend.ts (119 lines)
│   │   │   ├── ledger.ts (88 lines)
│   │   │   └── liquidity.ts (107 lines)
│   │   ├── types.ts (21 lines)
│   │   └── utils/
│   │       ├── currency.ts (52 lines)
│   │       ├── ledgerIdl.ts (84 lines)
│   │       ├── liquidityStats.test.ts (108 lines)
│   │       └── liquidityStats.ts (150 lines)
│   ├── tailwind.config.js (51 lines)
│   ├── tsconfig.json (33 lines)
│   ├── tsconfig.node.json (11 lines)
│   └── vite.config.ts (34 lines)
├── plinko_backend/
│   ├── AUDIT_REPORT.md (119 lines)
│   ├── Cargo.toml (23 lines)
│   ├── plinko_backend.did (179 lines)
│   └── src/
│       ├── defi_accounting/
│       │   ├── ARCHITECTURE.md (793 lines)
│       │   ├── CLAUDE.md (67 lines)
│       │   ├── accounting.rs (778 lines)
│       │   ├── admin_query.rs (136 lines)
│       │   ├── liquidity_pool.rs (708 lines)
│       │   ├── memory_ids.rs (54 lines)
│       │   ├── mod.rs (32 lines)
│       │   ├── query.rs (43 lines)
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
│       │   │   ├── test_serialization.rs (62 lines)
│       │   │   └── test_slippage_audit.rs (267 lines)
│       │   └── types.rs (190 lines)
│       ├── game.rs (351 lines)
│       ├── lib.rs (597 lines)
│       └── types.rs (77 lines)
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
- `roulette_backend/` - Roulette game backend canister
- `dice_backend/` - Dice game backend canister
- `openhouse_frontend/` - Multi-game frontend interface
- `scripts/` - Utility scripts

**Note:** Some files and directories are excluded based on hardcoded patterns.
