# Roulette Animation Improvements Plan

## Overview

This document outlines frontend UI improvements to the roulette game animation to create a more immersive and informative user experience.

## Current Issues

### 1. Delayed Ball Animation
**Problem**: The ball only starts spinning after the ~3 second backend response. The wheel sits idle while waiting.
**Location**: `RouletteGame.tsx:132-174` - `handleSpin` awaits backend before setting `winningNumber`
**Impact**: Users experience dead time between clicking SPIN and seeing any visual feedback.

### 2. Abrupt Animation Reset
**Problem**: When animation completes, `RouletteWheel.tsx:44-47` simply clears all animation styles, causing the ball to snap back to default position.
**Impact**: Users can't tell where the ball actually landed because it disappears from the winning slot.

### 3. No Winning Number Indicator
**Problem**: After the ball stops, there's no visual emphasis on which number won.
**Impact**: Users must mentally track the ball position or rely solely on the result text.

### 4. No Winning Bet Highlights
**Problem**: The betting board doesn't show which bets were winners after a spin.
**Location**: `BettingBoard.tsx` has no awareness of winning number
**Impact**: Users with multiple bets can't quickly see which ones paid out.

---

## Implementation Plan

### Phase 1: Immediate Ball Spinning (While Awaiting Backend)

**Files to modify**: `RouletteGame.tsx`, `RouletteWheel.tsx`

#### Changes:

1. **Add new spinning state**: Separate `isWaitingForResult` from `isSpinning`
   ```typescript
   // RouletteGame.tsx
   const [isWaitingForResult, setIsWaitingForResult] = useState(false);
   const [isAnimating, setIsAnimating] = useState(false);
   ```

2. **Update RouletteWheel props**:
   ```typescript
   interface RouletteWheelProps {
     winningNumber: number | null;
     isWaitingForResult: boolean;  // Ball spins fast, no target
     isLanding: boolean;           // Ball decelerating to target
     onAnimationComplete?: () => void;
   }
   ```

3. **Modify handleSpin flow**:
   ```typescript
   const handleSpin = async () => {
     // 1. Start indefinite spin immediately
     setIsWaitingForResult(true);
     setIsAnimating(true);

     // 2. Call backend (ball keeps spinning)
     const result = await actor.spin(backendBets);

     // 3. Transition to landing phase
     setIsWaitingForResult(false);
     setWinningNumber(result.Ok.winning_number);
     // Ball now decelerates to winning position
   };
   ```

4. **Update wheel animation logic**:
   - **Waiting phase**: Continuous fast rotation, no target
   - **Landing phase**: Triggered when `winningNumber` is set, smooth deceleration to exact position

---

### Phase 2: Smooth Ball Landing Animation

**Files to modify**: `RouletteWheel.tsx`

#### Changes:

1. **Calculate precise landing position**:
   ```typescript
   const calculateBallPosition = (winningNumber: number) => {
     const index = WHEEL_NUMBERS.indexOf(winningNumber);
     const degreesPerSlot = 360 / 37;
     // Add multiple full rotations for visual effect
     const totalRotation = (5 * 360) + (index * degreesPerSlot);
     return totalRotation;
   };
   ```

2. **Use CSS transitions instead of keyframe animations**:
   ```css
   .ball-track {
     transition: transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99);
   }
   ```

3. **Add easing for realistic deceleration**:
   - Start with fast rotation
   - Gradually slow down (mimics physics)
   - Settle into final position with slight bounce

4. **Keep ball in final position**: After animation completes, maintain transform at winning position until next spin.

---

### Phase 3: Winning Number Highlight

**Files to modify**: `RouletteWheel.tsx`

#### Changes:

1. **Add `showResult` state** that activates after ball settles:
   ```typescript
   const [showResult, setShowResult] = useState(false);

   useEffect(() => {
     if (!isLanding && winningNumber !== null) {
       // Ball has landed
       setTimeout(() => setShowResult(true), 500);
     }
   }, [isLanding, winningNumber]);
   ```

2. **Highlight winning number section on wheel**:
   ```typescript
   // In number rendering
   const isWinner = showResult && number === winningNumber;
   const bgColor = isWinner
     ? 'bg-yellow-400 animate-pulse shadow-lg shadow-yellow-400/50'
     : isGreen ? 'bg-green-600' : isRed ? 'bg-red-600' : 'bg-black';
   ```

3. **Add winning number callout**:
   ```tsx
   {showResult && winningNumber !== null && (
     <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
       <div className="bg-black/80 rounded-full w-20 h-20 flex flex-col items-center justify-center border-2 border-yellow-400 animate-in zoom-in duration-300">
         <span className={`text-3xl font-bold ${isRed ? 'text-red-500' : isGreen ? 'text-green-500' : 'text-white'}`}>
           {winningNumber}
         </span>
         <span className="text-xs text-gray-400">{isRed ? 'RED' : isGreen ? 'GREEN' : 'BLACK'}</span>
       </div>
     </div>
   )}
   ```

---

### Phase 4: Winning Bets Highlight on Board

**Files to modify**: `BettingBoard.tsx`, `RouletteGame.tsx`

#### Changes:

1. **Add `winningNumber` prop to BettingBoard**:
   ```typescript
   interface BettingBoardProps {
     bets: PlacedBet[];
     chipValue: number;
     onPlaceBet: (bet: PlacedBet) => void;
     onRemoveBet: (bet: PlacedBet) => void;
     disabled?: boolean;
     winningNumber?: number | null;  // NEW
     showResults?: boolean;          // NEW
   }
   ```

2. **Create helper to check if bet wins**:
   ```typescript
   const isBetWinner = (bet: PlacedBet, winningNumber: number): boolean => {
     return bet.numbers.includes(winningNumber);
   };
   ```

3. **Highlight winning number cells**:
   ```typescript
   const isWinningNumber = showResults && winningNumber !== null && num === winningNumber;

   <div className={`... ${isWinningNumber ? 'ring-2 ring-yellow-400 animate-pulse' : ''}`}>
   ```

4. **Highlight winning bet positions**:
   ```typescript
   const isWinningBet = showResults && winningNumber !== null &&
     bets.some(bet => bet.numbers.includes(winningNumber) &&
       bet.numbers.sort().join(',') === numbers.sort().join(','));

   {isWinningBet && (
     <div className="absolute inset-0 bg-green-400/30 animate-pulse rounded" />
   )}
   ```

5. **Show payout amounts on winning bets**:
   ```typescript
   {isWinningBet && (
     <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[8px] px-1 rounded font-bold">
       +${calculatePayout(bet)}
     </div>
   )}
   ```

---

### Phase 5: Animation State Machine

**Files to modify**: `RouletteGame.tsx`

Create a clear state machine for the animation lifecycle:

```typescript
type AnimationState =
  | 'idle'           // Ready to spin
  | 'waiting'        // Ball spinning, awaiting backend
  | 'landing'        // Got result, ball decelerating
  | 'showing_result' // Ball stopped, highlights active
  | 'resetting';     // Clearing for next spin

const [animationState, setAnimationState] = useState<AnimationState>('idle');
```

State transitions:
```
idle -> waiting        (user clicks SPIN)
waiting -> landing     (backend response received)
landing -> showing_result (animation complete callback)
showing_result -> idle (timeout or user clicks "NEW SPIN")
```

---

## Implementation Checklist

- [ ] **Phase 1**: Decouple spinning from backend response
  - [ ] Add `isWaitingForResult` state
  - [ ] Start wheel spinning on button click
  - [ ] Continue spinning until backend responds
  - [ ] Transition to landing animation

- [ ] **Phase 2**: Improve landing animation
  - [ ] Calculate exact rotation for each number
  - [ ] Use cubic-bezier easing for natural deceleration
  - [ ] Keep ball at final position (don't reset)
  - [ ] Add `onAnimationComplete` callback

- [ ] **Phase 3**: Highlight winning number on wheel
  - [ ] Add pulsing glow to winning number section
  - [ ] Show center callout with winning number
  - [ ] Indicate color (red/black/green)

- [ ] **Phase 4**: Highlight winning bets on board
  - [ ] Pass `winningNumber` to BettingBoard
  - [ ] Highlight the winning number cell
  - [ ] Highlight all bet positions that won
  - [ ] Show payout amounts on winning chips

- [ ] **Phase 5**: Clean state management
  - [ ] Implement animation state machine
  - [ ] Handle edge cases (rapid re-spins, errors)
  - [ ] Add "SPIN AGAIN" button after result shown

---

## Visual Mockup

```
BEFORE (Current):                      AFTER (Improved):

[Click SPIN]                           [Click SPIN]
     |                                      |
     v                                      v
[Wait 3s... nothing]                   [Ball starts spinning immediately!]
     |                                      |
     v                                      v
[Backend responds]                     [Backend responds]
     |                                      |
     v                                      v
[Animation starts]                     [Ball decelerates smoothly]
     |                                      |
     v                                      v
[Animation ends, ball disappears]      [Ball lands on 17, stays there]
     |                                      |
     v                                      v
[Text shows "17 RED"]                  [17 glows on wheel + board]
                                       [Winning bets pulse green]
                                       [Payout amounts shown]
```

---

## Technical Notes

### Timing Constants
```typescript
const TIMING = {
  MIN_SPIN_DURATION: 2000,    // Minimum time ball spins (looks bad if too fast)
  LANDING_DURATION: 4000,     // Time for ball to decelerate to position
  RESULT_DISPLAY: 5000,       // Time to show results before reset
  HIGHLIGHT_PULSE_MS: 1500,   // Pulse animation duration
};
```

### Ball Position Calculation
The wheel has 37 slots (0-36). European wheel order:
```typescript
const WHEEL_NUMBERS = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
```

To position ball at number N:
```typescript
const index = WHEEL_NUMBERS.indexOf(N);
const degrees = (index / 37) * 360;
// Add extra rotations for visual effect
const finalRotation = (numRotations * 360) + degrees;
```

---

## Files Summary

| File | Changes |
|------|---------|
| `RouletteGame.tsx` | Animation state machine, timing logic |
| `RouletteWheel.tsx` | New animation phases, result highlight |
| `BettingBoard.tsx` | Winning bet highlights, payout display |

---

## Success Criteria

1. Ball starts spinning immediately when user clicks SPIN
2. Ball smoothly decelerates and lands on winning number
3. Ball remains visible at winning position after landing
4. Winning number on wheel glows/pulses
5. Winning bets on board are highlighted with green glow
6. Payout amounts visible on winning bet positions
7. Clear visual distinction between waiting/landing/result states
