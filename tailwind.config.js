/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      colors: {
        bg: '#faf9f6',
        surface: '#ffffff',
        ink: '#1c1b2e',
        muted: '#6e6c86',
        line: '#e6e5ee',
        accent: { DEFAULT: '#7c3aed', dark: '#5b21b6', soft: '#f1e9fd' },
        accent2: { DEFAULT: '#f4923a', dark: '#c96f1f', soft: '#fff1e2' },
        danger: { DEFAULT: '#d94f4a', soft: '#fff5f5', border: '#f4a3a0' },
        success: { DEFAULT: '#1a9a5c', soft: '#eafaf1', border: '#a8e6c4' },
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl2: '18px',
      },
      boxShadow: {
        pop: '0 3px 0 #e6e5ee',
        'pop-sm': '0 2px 0 #e6e5ee',
        'pop-accent': '0 3px 0 #5b21b6',
        'pop-accent-sm': '0 2px 0 #5b21b6',
        'pop-accent2': '0 3px 0 #c96f1f',
      },
    },
  },
  plugins: [],
}
