/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f2f5fb',
          100: '#e3eaf6',
          200: '#c6d5ed',
          300: '#9bb5de',
          400: '#688fca',
          500: '#4571b3',
          600: '#335a97',
          700: '#2b4a7b',
          800: '#273f66',
          900: '#1b2b46',
        },
        brand: {
          50: '#eef4ff',
          100: '#dbe6ff',
          200: '#bed1ff',
          300: '#92b1ff',
          400: '#5e85fb',
          500: '#395bf4',
          600: '#2340e4',
          700: '#1c31c7',
          800: '#1d2da0',
          900: '#1d2c7e',
        },
      },
      fontFamily: {
        sans: [
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'Malgun Gothic',
          'Apple SD Gothic Neo',
          'system-ui',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 8px 24px -12px rgba(16, 24, 40, 0.12)',
        pop: '0 12px 32px -8px rgba(16, 24, 40, 0.18)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
};
