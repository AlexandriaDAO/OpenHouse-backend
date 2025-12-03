/** @type {import('tailwindcss').Config} */
import colors from 'tailwindcss/colors';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // DFINITY brand colors
        dfinity: {
          turquoise: '#39FF14',  // Main brand color - Lime green hacker terminal theme
          purple: '#3B00B9',      // Secondary/links
          green: '#00E19B',       // Success/positive
          red: '#ED0047',         // Error/negative
          orange: '#F15A24',      // Hover states
          navy: '#0E031F',        // Deep background
          gray: '#E6E6E6',        // Light UI elements
        },
        // Core monochrome
        'pure-black': '#000000',
        'pure-white': '#FFFFFF',
        // Override Tailwind's blue-tinted gray with neutral gray
        gray: colors.neutral,
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'monospace'],
        pixel: ['"Press Start 2P"', 'cursive'],
      }
    },
  },
  plugins: [
    require('@tailwindcss/container-queries'),
  ],
  safelist: [
    {
      pattern: /^(text|bg|border)-(dfinity-turquoise|orange-500|green-500|purple-400|yellow-400|emerald-400)/,
      variants: ['hover'],
    },
    {
      pattern: /^from-(dfinity-turquoise|orange-500|green-500)\/5/,
    },
    {
      pattern: /^(bg|border)-(dfinity-turquoise|orange-500|green-500)\/(10|20|30)/,
      variants: ['hover'],
    },
  ],
}
