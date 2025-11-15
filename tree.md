# OpenHouse Casino - Project Structure

Generated on: 2025-11-15T10:01:32.309Z

```
├── crash_backend/
│   ├── Cargo.toml (17 lines)
│   ├── crash_backend.did (49 lines)
│   └── src/
│       └── lib.rs (291 lines)
├── dice_backend/
│   ├── Cargo.toml (19 lines)
│   ├── dice_backend.did (83 lines)
│   └── src/
│       ├── accounting.rs (432 lines)
│       └── lib.rs (1055 lines)
├── mines_backend/
│   ├── Cargo.toml (17 lines)
│   ├── mines_backend.did (69 lines)
│   └── src/
│       └── lib.rs (847 lines)
├── openhouse_frontend/
│   ├── BALANCE_GUIDE.md (297 lines)
│   ├── build-auth.js (16 lines)
│   ├── index.html (15 lines)
│   ├── package.json (33 lines)
│   ├── postcss.config.js (7 lines)
│   ├── src/
│   │   ├── App.backup.tsx (35 lines)
│   │   ├── App.tsx (38 lines)
│   │   ├── components/
│   │   │   ├── AuthButton.tsx (120 lines)
│   │   │   ├── DiceAnimation.css (103 lines)
│   │   │   ├── DiceAnimation.tsx (123 lines)
│   │   │   ├── GameCard.tsx (42 lines)
│   │   │   ├── Layout.tsx (77 lines)
│   │   │   ├── game-specific/
│   │   │   │   ├── dice/
│   │   │   │   │   ├── DiceAccountingPanel.tsx (233 lines)
│   │   │   │   │   ├── DiceAnimation.css (171 lines)
│   │   │   │   │   ├── DiceAnimation.tsx (234 lines)
│   │   │   │   │   ├── DiceControls.tsx (67 lines)
│   │   │   │   │   └── index.ts (4 lines)
│   │   │   │   └── plinko/
│   │   │   │       ├── PlinkoBoard.css (111 lines)
│   │   │   │       ├── PlinkoBoard.tsx (166 lines)
│   │   │   │       ├── PlinkoControls.tsx (90 lines)
│   │   │   │       ├── PlinkoMultipliers.tsx (39 lines)
│   │   │   │       └── index.ts (5 lines)
│   │   │   ├── game-ui/
│   │   │   │   ├── AuthNotice.tsx (27 lines)
│   │   │   │   ├── BetAmountInput.tsx (97 lines)
│   │   │   │   ├── ConnectionStatus.tsx (61 lines)
│   │   │   │   ├── GameButton.tsx (67 lines)
│   │   │   │   ├── GameHistory.tsx (69 lines)
│   │   │   │   ├── GameLayout.tsx (40 lines)
│   │   │   │   ├── GameStats.tsx (73 lines)
│   │   │   │   └── index.ts (12 lines)
│   │   │   └── ui/
│   │   │       └── ConnectionStatus.tsx (196 lines)
│   │   ├── hooks/
│   │   │   ├── actors/
│   │   │   │   ├── useCrashActor.ts (14 lines)
│   │   │   │   ├── useDiceActor.ts (14 lines)
│   │   │   │   ├── useLedgerActor.ts (14 lines)
│   │   │   │   ├── useMinesActor.ts (14 lines)
│   │   │   │   └── usePlinkoActor.ts (14 lines)
│   │   │   └── games/
│   │   │       ├── index.ts (5 lines)
│   │   │       ├── useBetValidation.ts (70 lines)
│   │   │       ├── useGameHistory.ts (47 lines)
│   │   │       ├── useGameMode.ts (16 lines)
│   │   │       └── useGameState.ts (106 lines)
│   │   ├── index.css (89 lines)
│   │   ├── main.tsx (11 lines)
│   │   ├── pages/
│   │   │   ├── Crash.tsx (140 lines)
│   │   │   ├── Dice.tsx (452 lines)
│   │   │   ├── Home.tsx (61 lines)
│   │   │   ├── Mines.tsx (355 lines)
│   │   │   └── Plinko.tsx (204 lines)
│   │   ├── providers/
│   │   │   ├── ActorProvider.tsx (106 lines)
│   │   │   ├── AuthProvider.tsx (127 lines)
│   │   │   ├── BalanceProvider.tsx (85 lines)
│   │   │   └── GameBalanceProvider.tsx (486 lines)
│   │   ├── types/
│   │   │   ├── balance.ts (85 lines)
│   │   │   └── ledger.ts (35 lines)
│   │   ├── types.ts (19 lines)
│   │   └── utils/
│   │       └── ledgerIdl.ts (24 lines)
│   ├── tailwind.config.js (32 lines)
│   ├── tsconfig.json (33 lines)
│   ├── tsconfig.node.json (11 lines)
│   └── vite.config.ts (34 lines)
├── plinko_backend/
│   ├── Cargo.toml (15 lines)
│   ├── plinko_backend.did (26 lines)
│   └── src/
│       └── lib.rs (272 lines)
└── scripts/

```

## Summary

This tree shows the complete file structure of the OpenHouse Casino project with line counts for each file.

### Key Directories:
- `crash_backend/` - Crash game backend canister
- `plinko_backend/` - Plinko game backend canister
- `mines_backend/` - Mines game backend canister
- `dice_backend/` - Dice game backend canister
- `openhouse_frontend/` - Multi-game frontend interface
- `scripts/` - Utility scripts

**Note:** Some files and directories are excluded based on hardcoded patterns.
