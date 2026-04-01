/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sf: {
          blue: '#29B5E8',
          navy: '#11567F',
          cyan: '#64D2FF',
          coral: '#FF6F61',
          olive: '#6B8E23',
          orchid: '#DA70D6',
        },
        dark: {
          bg: '#0f172a',
          surface: '#1e293b',
          border: '#334155',
          text: '#e2e8f0',
          muted: '#94a3b8',
        },
      },
    },
  },
  plugins: [],
};
