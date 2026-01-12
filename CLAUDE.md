# OpenHouse Backend - Claude Deployment Guide

## 🎰 CRITICAL: Mainnet-Only Backend Canisters

**⚠️ IMPORTANT: There is no local testing environment. ALL testing happens on mainnet.**

This repository contains only the **backend canisters** for the OpenHouse casino platform. The frontend is maintained separately in the [OpenHouse](https://github.com/AlexandriaDAO/OpenHouse) repository.

## 🎯 Project Philosophy

**"Open House"** - A play on words:
- We're **the house** (casino)
- Everything is **open-source** with transparent odds
- All games are **provably fair** using IC's VRF

## 🚀 Quick Start

These canisters are no longer deployable. Controllers that can deploy are not added, and will only be added in an emergency assuming a smart contract bug in the 4 core games (dice, crash, plinko, roulette).

Life1, Life2, and Life3 are still editable and deployable though, as there's no defi integration there yet.

## 📦 Canister Architecture

| Component | Canister ID | Purpose |
|-----------|-------------|---------|
| **Dice Backend** | `whchi-hyaaa-aaaao-a4ruq-cai` | Dice game logic |
| **Plinko Backend** | `weupr-2qaaa-aaaap-abl3q-cai` | Plinko game logic |
| **Crash Backend** | `fws6k-tyaaa-aaaap-qqc7q-cai` | Crash game logic |
| **Roulette Backend** | `wvrcw-3aaaa-aaaah-arm4a-cai` | Roulette game logic |
| **Life1 Backend** | `pijnb-7yaaa-aaaae-qgcuq-cai` | Game of Life - Server 1 |
| **Life2 Backend** | `qoski-4yaaa-aaaai-q4g4a-cai` | Game of Life - Server 2 |
| **Life3 Backend** | `66p3s-uaaaa-aaaad-ac47a-cai` | Game of Life - Server 3 |

**Note:** Frontend is deployed separately from the [OpenHouse](https://github.com/AlexandriaDAO/OpenHouse) repo.

## 🎮 Games Overview

### 1. Dice
- **Mechanics**: Roll a number from 0-100, predict over or under target
- **Objective**: Choose target number and direction, win if roll matches prediction
- **Min Bet**: 0.01 USDT
- **Max Bet**: Dynamic based on multiplier (100 USDT max win / multiplier)
- **Max Win**: 100 USDT
- **House Edge**: 1%
- **Win Chance**: 1% to 98% (adjustable via target number)
- **Canister**: `dice_backend`

### 2. Plinko
- **Mechanics**: Ball bounces through pegs to land in multiplier slots
- **Features**: Adjustable rows (8/12/16) and risk levels (Low/Medium/High)
- **Min Bet**: 0.01 USDT
- **Max Win**: 1000x (16 rows, high risk)
- **House Edge**: 1%
- **Canister**: `plinko_backend`

### 3. Crash Game
- **Mechanics**: Multiplier increases from 1.00x until it crashes
- **Objective**: Cash out before the crash
- **Min Bet**: 1 USDT
- **Max Win**: 1000x
- **House Edge**: 1%
- **Canister**: `crash_backend`

### 4. Roulette
- **Mechanics**: European roulette (single zero, 0-36)
- **Objective**: Predict where the ball lands on the wheel
- **Bet Types**: Straight (35:1), Split (17:1), Street (11:1), Corner (8:1), Six Line (5:1), Column/Dozen (2:1), Red/Black/Odd/Even/High/Low (1:1)
- **Min Bet**: 0.01 USDT
- **Max Bets Per Spin**: 20
- **House Edge**: 2.70% (European rules)
- **Canister**: `roulette_backend`

### Future Games
- **Slots**: Traditional slot machine with crypto themes
- **Blackjack**: Classic card game against the dealer