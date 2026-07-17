/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // ── Colour Palette ──────────────────────────────────────────────────
      colors: {
        // Surfaces — deep navy scale
        surface: {
          base:     '#0b0f1a', // page background
          subtle:   '#111827', // sidebar / nav
          elevated: '#1a2235', // cards, panels
          overlay:  '#243047', // modals, dropdowns
        },
        // Borders
        border: {
          DEFAULT: '#2a3550',
          strong:  '#3d4f6e',
        },
        // Accent — electric emerald (single trust accent)
        accent: {
          DEFAULT:  '#00c896',
          hover:    '#00e5ab',
          muted:    'rgba(0, 200, 150, 0.15)',
          border:   'rgba(0, 200, 150, 0.35)',
        },
        // Text
        ink: {
          primary:   '#e8edf5',
          secondary: '#8a9bb8',
          muted:     '#4f6080',
        },
        // Semantic states
        danger:  { DEFAULT: '#f85149', muted: 'rgba(248, 81, 73, 0.15)' },
        warning: { DEFAULT: '#d29922', muted: 'rgba(210, 153, 34, 0.15)' },
        success: { DEFAULT: '#3fb950', muted: 'rgba(63, 185, 80, 0.15)' },
      },

      // ── Typography ──────────────────────────────────────────────────────
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['ui-monospace', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
        xs:    ['0.75rem',  { lineHeight: '1.125rem' }],
        sm:    ['0.875rem', { lineHeight: '1.375rem' }],
        base:  ['1rem',     { lineHeight: '1.625rem' }],
        lg:    ['1.125rem', { lineHeight: '1.75rem' }],
        xl:    ['1.25rem',  { lineHeight: '1.875rem' }],
        '2xl': ['1.5rem',   { lineHeight: '2rem', letterSpacing: '-0.02em' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.025em' }],
        '4xl': ['2.25rem',  { lineHeight: '2.5rem', letterSpacing: '-0.03em' }],
      },

      // ── Radii ───────────────────────────────────────────────────────────
      borderRadius: {
        sm:   '0.25rem',
        DEFAULT: '0.5rem',
        md:   '0.5rem',
        lg:   '0.75rem',
        xl:   '1rem',
        '2xl':'1.5rem',
      },

      // ── Shadows ─────────────────────────────────────────────────────────
      boxShadow: {
        sm:  '0 1px 2px rgba(0,0,0,0.4)',
        DEFAULT: '0 4px 12px rgba(0,0,0,0.5)',
        md:  '0 4px 12px rgba(0,0,0,0.5)',
        lg:  '0 8px 24px rgba(0,0,0,0.6)',
        accent: '0 0 20px rgba(0, 200, 150, 0.25)',
      },
    },
  },
  plugins: [],
};

