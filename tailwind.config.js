/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          500: '#0284c7',
          600: '#0369a1',
          700: '#075985',
          800: '#0c4a6e',
          900: '#0f2b48',
          950: '#081a2e',
        },
        morocco: {
          light: '#ffedd5',
          DEFAULT: '#ea580c',
          dark: '#9a3412',
        },
        senegal: {
          light: '#dcfce7',
          DEFAULT: '#16a34a',
          dark: '#166534',
        },
        sand: {
          50: '#fdfbf7',
          100: '#f7f2e7',
          200: '#ebe1ce',
          300: '#dccab0',
          800: '#5c4832',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}

