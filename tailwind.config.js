/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: '#F7F4ED',
          card: '#FCFBF8',
          border: 'rgba(28, 28, 28, 0.08)',
        },
        ink: {
          DEFAULT: '#1C1C1C',
          muted: '#5F5F5F',
          subtle: '#8C8C8C',
          dark: '#0A0A0A',
        },
        navy: {
          DEFAULT: '#0B1220',
          dark: '#070C16',
          light: '#131D31',
          border: '#1E293B',
          hover: '#18243C',
        },
        brand: {
          blue: '#1F6FF0',
          'blue-hover': '#1658C7',
          selection: '#3B6EF5',
          pink: '#FF2E88',
          purple: '#8B7BF0',
          orange: '#FF6A2B',
        },
      },
      borderRadius: {
        '2xl': '20px',
        '3xl': '24px',
        '4xl': '28px',
        '5xl': '32px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      letterSpacing: {
        tighter: '-0.04em',
        tight: '-0.025em',
      },
      boxShadow: {
        'soft-prompt': '0 12px 40px -10px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.03)',
        'card-subtle': '0 1px 3px rgba(0,0,0,0.03)',
      },
    },
  },
  plugins: [],
}
