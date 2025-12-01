/** @type {import('tailwindcss').Config} */
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
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'monospace'],
        pixel: ['"Press Start 2P"', 'cursive'],
      }
    },
  },
  plugins: [],
}
