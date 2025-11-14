# OpenHouse Games Design System

**Retro Arcade + Cypherpunk Aesthetic**

---

## Design Philosophy

OpenHouse Games combines **retro arcade nostalgia** with **cypherpunk minimalism** to create a unique, high-contrast gaming experience. The design prioritizes:

- **Transparency**: Clean, readable UI that doesn't hide information
- **Terminal Aesthetic**: Monospace fonts and minimal borders evoke command-line interfaces
- **Retro Gaming**: Pixel fonts and classic arcade elements for nostalgia
- **DFINITY Brand**: Strategic use of brand colors as functional accents

---

## Color Palette

### Foundation Colors

Pure black and white form the base of all designs:

```css
/* Core Monochrome */
--pure-black: #000000;    /* Backgrounds, text on light surfaces */
--pure-white: #FFFFFF;    /* Text, dice faces, high contrast elements */
```

**Usage:**
- `pure-black`: Primary background color for all pages
- `pure-white`: Primary text color, dice cube faces
- `pure-white/60`: Secondary text (60% opacity)
- `pure-white/20`: Subtle borders and dividers (20% opacity)
- `pure-white/10`: Very subtle backgrounds (10% opacity)

### DFINITY Brand Colors

Strategic accent colors from the DFINITY brand palette:

```css
/* DFINITY Accent Colors */
--dfinity-turquoise: #29ABE2;  /* Primary actions, links, main brand */
--dfinity-purple: #3B00B9;      /* Secondary actions, hover states */
--dfinity-green: #00E19B;       /* Success, positive outcomes, "Over" button */
--dfinity-red: #ED0047;         /* Errors, negative outcomes, "Under" button */
--dfinity-orange: #F15A24;      /* Reserved for special hover/active states */
--dfinity-navy: #0E031F;        /* Deep backgrounds (rarely used) */
--dfinity-gray: #E6E6E6;        /* Light UI elements (rarely used) */
```

**Color Usage Strategy:**

| Color | Primary Use | Examples |
|-------|-------------|----------|
| **Turquoise** | Primary CTAs, links, main accents | "Roll Dice" button, nav links, card borders |
| **Purple** | Secondary actions, alternative states | Secondary buttons, badges |
| **Green** | Success, positive feedback, "win" actions | "Over" button, win messages, positive stats |
| **Red** | Error, negative feedback, "loss" actions | "Under" button, loss messages, error states |
| **Orange** | Special hover/active states | Reserved for future use |

### Color Combinations

**✅ Do:**
- Black background + white text (maximum contrast)
- Turquoise accents on black (primary brand)
- Green for wins, red for losses (universal gaming convention)
- Transparent backgrounds with colored borders (terminal aesthetic)

**❌ Don't:**
- Use multiple DFINITY colors together (pick one per component)
- Add gradients (conflicts with minimalist aesthetic)
- Use dark blue or purple for backgrounds (use pure black)
- Mix opacity levels within the same component

---

## Typography

### Font Families

```css
/* Typography System */
--font-pixel: "Press Start 2P", cursive;              /* Headers, titles, branding */
--font-mono: "JetBrains Mono", "IBM Plex Mono", monospace;  /* Body, UI, numbers */
```

**Google Fonts Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Press+Start+2P&display=swap');
```

### Typography Hierarchy

| Element | Font | Size | Weight | Usage |
|---------|------|------|--------|-------|
| **H1** | Press Start 2P | 5xl (3rem) | - | Page titles, hero text |
| **H2** | Press Start 2P | 3xl (1.875rem) | - | Section headers |
| **H3** | Press Start 2P | 2xl (1.5rem) | - | Card titles |
| **Body** | JetBrains Mono | base (1rem) | 400 | Paragraphs, descriptions |
| **Labels** | JetBrains Mono | sm (0.875rem) | 400 | Form labels, helper text |
| **Buttons** | JetBrains Mono | xl (1.25rem) | 700 | All interactive elements |
| **Stats** | JetBrains Mono | xs (0.75rem) | 700 | Numbers, odds, multipliers |

### Typography Rules

**✅ Do:**
- Use **Press Start 2P** for headers only (limited readability)
- Use **JetBrains Mono** for all body text, buttons, and UI elements
- Keep line-height generous (1.6-1.8) for monospace fonts
- Use bold (700) for emphasis and interactive elements

**❌ Don't:**
- Use Press Start 2P for body text (too hard to read)
- Mix serif fonts (breaks aesthetic)
- Use italic styles (rarely needed in terminal UI)
- Go below 12px font size for any text

---

## Component Patterns

### Buttons

**Primary Button (Turquoise):**
```tsx
<button className="
  bg-transparent border-2 border-dfinity-turquoise text-dfinity-turquoise
  hover:bg-dfinity-turquoise hover:text-pure-black
  font-mono font-bold py-4 px-6 text-xl transition
  disabled:border-pure-white/20 disabled:text-pure-white/20
">
  ROLL DICE
</button>
```

**Secondary Button (Purple):**
```tsx
<button className="
  bg-transparent border-2 border-dfinity-purple text-dfinity-purple
  hover:bg-dfinity-purple hover:text-pure-white
  font-mono font-bold py-4 px-6 text-xl transition
">
  SECONDARY ACTION
</button>
```

**Success Button (Green):**
```tsx
<button className="
  bg-transparent border-2 border-dfinity-green text-dfinity-green
  hover:bg-dfinity-green hover:text-pure-black
  font-mono font-bold py-3 transition
">
  OVER 50
</button>
```

**Danger Button (Red):**
```tsx
<button className="
  bg-transparent border-2 border-dfinity-red text-dfinity-red
  hover:bg-dfinity-red hover:text-pure-white
  font-mono font-bold py-3 transition
">
  UNDER 50
</button>
```

**Button Patterns:**
- Always use `border-2` (2px borders are the standard)
- Always transparent background by default
- Hover state fills background with border color
- Use `font-mono font-bold` for all buttons
- Padding: `py-4 px-6` for large buttons, `py-3` for compact buttons
- No border-radius (sharp corners for terminal aesthetic)

### Cards

**Standard Card:**
```tsx
<div className="bg-pure-black border border-pure-white/20 p-6">
  {/* Content */}
</div>
```

**Accented Card (with turquoise border):**
```tsx
<div className="bg-pure-black border border-dfinity-turquoise p-6">
  {/* Content */}
</div>
```

**Card Patterns:**
- Always `bg-pure-black` (never dark gray)
- Default border: `border-pure-white/20` (subtle)
- Accent border: `border-dfinity-turquoise` (emphasis)
- No rounded corners or shadows
- Padding: `p-6` (1.5rem) standard

### Inputs & Controls

**Range Slider (Turquoise Thumb):**
```tsx
<input
  type="range"
  className="w-full slider-turquoise"
  min="1"
  max="99"
/>
```

**Slider CSS:**
```css
.slider-turquoise {
  -webkit-appearance: none;
  background: transparent;
  outline: none;
}

.slider-turquoise::-webkit-slider-track {
  background: rgba(255, 255, 255, 0.1);
  height: 4px;
  border-radius: 2px;
}

.slider-turquoise::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  background: #29ABE2;  /* Turquoise */
  border: 2px solid #FFFFFF;
  border-radius: 50%;
  cursor: pointer;
}
```

**Text Input (if needed):**
```tsx
<input
  type="text"
  className="
    bg-transparent border-2 border-pure-white/20 text-pure-white
    focus:border-dfinity-turquoise
    font-mono px-4 py-2
  "
/>
```

### Stats & Data Display

**Stat Grid:**
```tsx
<div className="grid grid-cols-3 gap-2 text-xs font-mono">
  <div className="bg-pure-black border border-pure-white/10 p-2 text-center">
    <div className="text-pure-white/40 mb-1">Win Chance</div>
    <div className="font-bold text-dfinity-green">49.5%</div>
  </div>
  {/* More stats */}
</div>
```

**Stat Color Mappings:**
- `text-dfinity-green` - Positive outcomes, win chance, profit
- `text-dfinity-red` - Negative outcomes, house edge, losses
- `text-dfinity-turquoise` - Neutral highlights, multipliers
- `text-dfinity-purple` - Alternative highlights
- `text-pure-white/60` - Non-highlighted values

---

## Layout & Spacing

### Container Widths

```tsx
<div className="container mx-auto px-4 py-8">
  {/* Standard page container */}
</div>

<div className="max-w-2xl mx-auto">
  {/* Centered content, max 672px */}
</div>

<div className="max-w-4xl mx-auto">
  {/* Wide centered content, max 896px */}
</div>
```

### Spacing Scale

Use Tailwind's standard spacing scale consistently:

| Token | Pixels | Usage |
|-------|--------|-------|
| `gap-2` | 8px | Small gaps (stat grids) |
| `gap-4` | 16px | Default component spacing |
| `gap-6` | 24px | Card grids, section spacing |
| `p-2` | 8px | Tight padding (stat boxes) |
| `p-4` | 16px | Default padding |
| `p-6` | 24px | Card padding |
| `py-8` | 32px top/bottom | Page section spacing |
| `mb-4` | 16px | Default element margin |
| `mb-6` | 24px | Section margin |

### Borders

**Standard Borders:**
- `border` - 1px solid (for subtle dividers)
- `border-2` - 2px solid (for buttons, emphasis)
- `border-pure-white/20` - Subtle dividers
- `border-pure-white/10` - Very subtle backgrounds
- `border-dfinity-turquoise` - Accent borders

**No Border Radius:**
- ❌ Never use `rounded`, `rounded-lg`, etc.
- ✅ Keep sharp corners for terminal aesthetic
- Exception: Slider thumbs and dots can be `rounded-full` (circles)

---

## 3D Dice Animation

### Dice Cube Structure

The dice is a **realistic 3D cube** with 6 faces:

```tsx
<div className="dice-container">
  <div className="dice-cube">
    {/* Front face */}
    <div className="dice-face dice-face-front">
      <DiceDots number={displayNumber} />
    </div>

    {/* Back, Right, Left, Top, Bottom faces */}
    {/* Each positioned with 3D transforms */}
  </div>

  {/* Result glow */}
  <div className="result-glow-turquoise"></div>
</div>
```

### Dice Visual Specs

**Cube Dimensions:**
- Size: `150px × 150px × 150px`
- Face color: Pure white (`#FFFFFF`)
- Edge color: Black 2px border (`#000000`)
- Background: Pure black void (`#000000`)

**Dot Pattern:**
- Dot size: `20px` diameter
- Dot color: Black (`#000000`)
- Traditional dice layouts for numbers 1-6
- Large monospace numbers for 0, 7-100

**Animation:**
- Roll duration: 2 seconds
- Easing: `cubic-bezier(0.68, -0.55, 0.265, 1.55)` (bounce effect)
- Result glow: Turquoise pulsing radial gradient

**3D Transform:**
```css
.dice-container {
  perspective: 1000px;
  background: #000000;
}

.dice-cube {
  transform-style: preserve-3d;
}

/* Face positioning */
.dice-face-front  { transform: rotateY(0deg) translateZ(75px); }
.dice-face-back   { transform: rotateY(180deg) translateZ(75px); }
.dice-face-right  { transform: rotateY(90deg) translateZ(75px); }
.dice-face-left   { transform: rotateY(-90deg) translateZ(75px); }
.dice-face-top    { transform: rotateX(90deg) translateZ(75px); }
.dice-face-bottom { transform: rotateX(-90deg) translateZ(75px); }
```

---

## Header & Footer

### Header Structure

```tsx
<header className="bg-pure-black border-b border-pure-white/20">
  <div className="container mx-auto px-4 py-4">
    <div className="flex justify-between items-center">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2">
        <span className="text-3xl">🎰</span>
        <div>
          <h1 className="text-2xl font-pixel">OpenHouse Games</h1>
          <p className="text-xs text-dfinity-turquoise font-mono">
            Provably Fair Gaming
          </p>
        </div>
      </Link>

      {/* Auth button */}
      <AuthButton />
    </div>
  </div>
</header>
```

**Header Specs:**
- Background: Pure black
- Border: Bottom border, white 20% opacity
- Logo: Pixel font, 2xl size
- Tagline: Turquoise accent color, mono font, xs size
- Padding: 4 units (1rem) vertical

### Footer Structure

```tsx
<footer className="bg-pure-black border-t border-pure-white/20 py-6">
  <div className="container mx-auto px-4 text-center text-pure-white/60 text-sm font-mono">
    <p>
      OpenHouse Games -{' '}
      <a
        href="https://github.com/AlexandriaDAO/OpenHouse"
        target="_blank"
        rel="noopener noreferrer"
        className="text-dfinity-turquoise hover:underline"
      >
        Open Source
      </a>
      {' • '}
      An{' '}
      <a
        href="https://lbry.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-dfinity-turquoise hover:underline"
      >
        Alexandria
      </a>
      {' '}Project
    </p>
    <p className="mt-2">Powered by Internet Computer Random Beacon</p>
  </div>
</footer>
```

**Footer Specs:**
- Background: Pure black
- Border: Top border, white 20% opacity
- Text: White 60% opacity, mono font
- Links: Turquoise with underline on hover

---

## Animation Guidelines

### Transitions

**Standard Transitions:**
```css
transition-all duration-200  /* Default for most elements */
transition-colors            /* For text/background color changes */
transition-opacity           /* For fade effects */
```

**Button Hover:**
- Duration: 200ms
- Properties: `background-color`, `color`, `border-color`
- No easing specified (defaults to ease)

**Card Hover:**
```tsx
<div className="card hover:border-dfinity-turquoise transition-all duration-200">
  {/* No scale transform - keep it simple */}
</div>
```

### Dice Roll Animation

```css
@keyframes dice-roll {
  0% {
    transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg);
  }
  100% {
    transform: rotateX(720deg) rotateY(720deg) rotateZ(360deg);
  }
}

.dice-cube.rolling-animation {
  animation: dice-roll 2s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}
```

### Result Glow Animation

```css
@keyframes pulse-glow {
  0%, 100% {
    opacity: 0.4;
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    opacity: 0.8;
    transform: translate(-50%, -50%) scale(1.1);
  }
}

.result-glow-turquoise {
  animation: pulse-glow 1.5s ease-in-out infinite;
}
```

### Accessibility

**Reduced Motion:**
```css
@media (prefers-reduced-motion: reduce) {
  .dice-cube.rolling-animation {
    animation: none;
  }
  .result-glow-turquoise {
    animation: none;
  }
}
```

Always respect user motion preferences by disabling animations.

---

## Responsive Design

### Breakpoints

Use Tailwind's standard breakpoints:

```css
/* Mobile first approach */
sm: 640px   /* Small tablets */
md: 768px   /* Tablets */
lg: 1024px  /* Laptops */
xl: 1280px  /* Desktops */
```

### Grid Patterns

**Feature Cards:**
```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
  {/* 1 column mobile, 3 columns tablet+ */}
</div>
```

**Game Cards:**
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
  {/* 1 mobile, 2 tablet, 4 desktop */}
</div>
```

### Text Sizing

**Responsive Headers:**
```tsx
<h1 className="text-5xl font-pixel">
  {/* Scales down automatically on mobile */}
</h1>
```

For extreme size differences, use responsive classes:
```tsx
<h1 className="text-3xl md:text-5xl font-pixel">
  {/* 3xl mobile, 5xl tablet+ */}
</h1>
```

---

## Code Examples

### Complete Button Component

```tsx
interface GameButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
}

export const GameButton: React.FC<GameButtonProps> = ({
  onClick,
  disabled = false,
  loading = false,
  label,
  variant = 'primary',
}) => {
  const getButtonStyles = () => {
    const base = `font-mono font-bold py-4 text-xl transition border-2 w-full`;

    switch (variant) {
      case 'primary':
        return `${base} bg-transparent border-dfinity-turquoise text-dfinity-turquoise
                hover:bg-dfinity-turquoise hover:text-pure-black
                disabled:border-pure-white/20 disabled:text-pure-white/20`;
      case 'secondary':
        return `${base} bg-transparent border-dfinity-purple text-dfinity-purple
                hover:bg-dfinity-purple hover:text-pure-white
                disabled:border-pure-white/20 disabled:text-pure-white/20`;
      case 'danger':
        return `${base} bg-transparent border-dfinity-red text-dfinity-red
                hover:bg-dfinity-red hover:text-pure-white
                disabled:border-pure-white/20 disabled:text-pure-white/20`;
      default:
        return base;
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={getButtonStyles()}
    >
      {loading ? `${label}...` : label}
    </button>
  );
};
```

### Complete Card Component

```tsx
interface CardProps {
  children: React.ReactNode;
  accent?: boolean;
  className?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  accent = false,
  className = '',
}) => {
  const baseClasses = 'bg-pure-black border p-6';
  const borderClass = accent ? 'border-dfinity-turquoise' : 'border-pure-white/20';

  return (
    <div className={`${baseClasses} ${borderClass} ${className}`}>
      {children}
    </div>
  );
};
```

### Complete Page Layout

```tsx
export const GamePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-pure-black">
      {/* Header */}
      <header className="bg-pure-black border-b border-pure-white/20">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-3xl">🎰</span>
              <h1 className="text-2xl font-pixel">OpenHouse Games</h1>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">

          {/* Hero Section */}
          <div className="text-center space-y-4 mb-8">
            <h2 className="text-5xl font-pixel">Dice Game</h2>
            <p className="text-xl text-pure-white/60 font-mono">
              Roll over or under your target number
            </p>
          </div>

          {/* Game Card */}
          <div className="bg-pure-black border border-dfinity-turquoise p-6">
            {/* Game content */}
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="bg-pure-black border-t border-pure-white/20 py-6">
        <div className="container mx-auto px-4 text-center text-pure-white/60 text-sm font-mono">
          <p>
            OpenHouse Games -{' '}
            <a href="https://github.com/AlexandriaDAO/OpenHouse" className="text-dfinity-turquoise hover:underline">
              Open Source
            </a>
            {' • '}
            An <a href="https://lbry.app/" className="text-dfinity-turquoise hover:underline">Alexandria</a> Project
          </p>
          <p className="mt-2">Powered by Internet Computer Random Beacon</p>
        </div>
      </footer>
    </div>
  );
};
```

---

## Quick Reference

### Tailwind Config

```javascript
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        dfinity: {
          turquoise: '#29ABE2',
          purple: '#3B00B9',
          green: '#00E19B',
          red: '#ED0047',
          orange: '#F15A24',
          navy: '#0E031F',
          gray: '#E6E6E6',
        },
        'pure-black': '#000000',
        'pure-white': '#FFFFFF',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'monospace'],
        pixel: ['"Press Start 2P"', 'cursive'],
      }
    },
  },
}
```

### CSS Variables Alternative

```css
:root {
  /* Colors */
  --color-turquoise: #29ABE2;
  --color-purple: #3B00B9;
  --color-green: #00E19B;
  --color-red: #ED0047;
  --color-orange: #F15A24;

  /* Monochrome */
  --color-black: #000000;
  --color-white: #FFFFFF;

  /* Typography */
  --font-pixel: "Press Start 2P", cursive;
  --font-mono: "JetBrains Mono", "IBM Plex Mono", monospace;
}
```

---

## Don't Break These Rules

### ❌ Never Do This

1. **No rounded corners** (except circles like slider thumbs)
2. **No gradients** on backgrounds or text
3. **No shadows** (conflicts with flat terminal aesthetic)
4. **No dark gray backgrounds** (always pure black)
5. **No mixing multiple accent colors** in one component
6. **No Press Start 2P for body text** (readability)
7. **No animations over 2 seconds** (feels sluggish)
8. **No blur effects** (except for motion blur during dice roll)

### ✅ Always Do This

1. **Pure black backgrounds** everywhere
2. **High contrast** text (white or 60% white minimum)
3. **2px borders** for interactive elements
4. **Monospace fonts** for all UI text
5. **One accent color per component** (turquoise primary)
6. **Respect reduced motion** preferences
7. **Sharp corners** (no border-radius except circles)
8. **Test on both light and dark mode systems** (should always look dark)

---

## Future Enhancements (Not Yet Implemented)

Ideas for maintaining the aesthetic while expanding:

- **Scanline overlay** - Subtle CRT effect on backgrounds
- **Grid floor** - Tron-style grid beneath 3D elements
- **Per-game color signatures** - Each game gets its own accent color
- **Particle effects** - Minimal, monochrome confetti for wins
- **Sound design** - 8-bit bleeps and bloops
- **Loading states** - ASCII art loaders

All future enhancements should maintain the core principles: high contrast, minimal, terminal-inspired, retro gaming nostalgia.

---

**Last Updated**: 2025-01-13
**Version**: 1.0
**Live Example**: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
