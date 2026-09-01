/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Colori dinamici del ristorante, gestiti via CSS variables
        brand: {
          primary:   'var(--brand-primary)',
          secondary: 'var(--brand-secondary)',
          bg:        'var(--brand-bg)',
          text:      'var(--brand-text)',
        },
      },
      fontFamily: {
        brand: ['var(--brand-font)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
