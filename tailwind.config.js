/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#171717',
          950: '#000000',
          900: '#0a0a0a',
          850: '#121212',
          800: '#171717',
          700: '#262626',
          600: '#333333',
          500: '#525252',
          400: '#737373',
          300: '#a3a3a3',
          200: '#d4d4d4',
          100: '#ededed',
        },
        geist: {
          canvas: '#000000',
          surface: '#0a0a0a',
          card: '#121212',
          cardHover: '#171717',
          hairline: '#262626',
          hairlineStrong: '#404040',
          foreground: '#ededed',
          muted: '#888888',
          accent: '#0070f3',
          success: '#00dfa2',
          warning: '#f5a623',
          error: '#ee0000',
          cyan: '#50e3c2',
        }
      },
      fontFamily: {
        sans: ['Geist', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'Fira Code', 'ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: {
        'none': '0px',
        'xs': '4px',
        'sm': '6px',      /* --geist-radius */
        'DEFAULT': '6px', /* default slight radius */
        'md': '8px',      /* --geist-marketing-radius */
        'lg': '12px',
        'xl': '16px',
        'pill-sm': '64px',
        'pill': '100px',
        'full': '9999px',
      },
      letterSpacing: {
        tightest: '-0.04em',
        tighter: '-0.025em',
        tight: '-0.015em',
      }
    },
  },
  plugins: [],
}
