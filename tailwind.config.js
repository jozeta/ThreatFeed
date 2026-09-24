/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        serif: ['var(--font-headline, "Newsreader")', 'Georgia', 'Cambria', '"Times New Roman"', 'serif'],
        sans: ['var(--font-body, "Inter")', 'Arial', 'Helvetica', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', 'monospace'],
      },
      colors: {
        theme: {
          bg: 'var(--color-bg)',
          surface: 'var(--color-surface)',
          card: 'var(--color-card)',
          border: 'var(--color-border)',
          'border-strong': 'var(--color-border-strong)',
          text: 'var(--color-text)',
          'text-muted': 'var(--color-text-muted)',
          accent: 'var(--color-accent)',
          'accent-hover': 'var(--color-accent-hover)',
          'accent-subtle': 'var(--color-accent-subtle)',
        }
      }
    },
  },
  plugins: [],
}
