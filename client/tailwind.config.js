/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#cc001e',
          'red-hover': '#e00022',
          'red-dark': '#8a0014',
          'red-glow': 'rgba(204, 0, 30, 0.4)',
          dark: '#0e0e0e',
          surface: '#141417',
          card: '#1a1a1f',
          'card-hover': '#23232a',
          border: '#2a2a33',
          'border-subtle': '#1f1f26',
          light: '#f0f4f5',
          muted: '#8f98a3',
          accentYellow: '#f59e0b',
          accentBlue: '#2563eb',
        },
      },
      fontFamily: {
        display: ['"Cinzel"', 'serif'],
        sans: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'brand-glow': '0 0 30px -5px rgba(204, 0, 30, 0.45)',
        'brand-glow-sm': '0 0 16px -3px rgba(204, 0, 30, 0.35)',
        'card-elevated': '0 12px 32px -8px rgba(0, 0, 0, 0.75)',
      },
    },
  },
  plugins: [],
};
