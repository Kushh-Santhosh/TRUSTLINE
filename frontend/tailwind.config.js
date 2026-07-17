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
        // Surfaces — cool-tinted light scale
        surface: {
          base:     '#F8F9FB', // page background (slightly blue-tinted)
          subtle:   '#F0F2F5', // table rows, code blocks, input disabled
          elevated: '#FFFFFF', // cards, panels, modals
          overlay:  '#F5F6F9', // tooltips, popovers
        },
        // Borders — two-weight system
        border: {
          DEFAULT: '#E2E5EA',
          strong:  '#C8CDD6',
          focus:   '#2563EB',
        },
        // Accent — trusted blue with full intent range
        accent: {
          DEFAULT:  '#2563EB',
          hover:    '#1D4ED8',
          active:   '#1E40AF',
          muted:    'rgba(37, 99, 235, 0.08)',
          border:   'rgba(37, 99, 235, 0.22)',
          ring:     'rgba(37, 99, 235, 0.18)',
        },
        // Ink — neutral with a cool undertone
        ink: {
          primary:   '#0F172A', // near-black slate
          secondary: '#475569', // mid-gray
          muted:     '#94A3B8', // light, placeholders
          inverted:  '#FFFFFF',
        },
        // Semantic states — WCAG AA compliant on white
        danger: {
          DEFAULT: '#DC2626',
          hover:   '#B91C1C',
          muted:   'rgba(220, 38, 38, 0.07)',
          border:  'rgba(220, 38, 38, 0.20)',
          ring:    'rgba(220, 38, 38, 0.18)',
        },
        warning: {
          DEFAULT: '#D97706',
          muted:   'rgba(217, 119, 6, 0.08)',
          border:  'rgba(217, 119, 6, 0.22)',
        },
        success: {
          DEFAULT: '#16A34A',
          muted:   'rgba(22, 163, 74, 0.08)',
          border:  'rgba(22, 163, 74, 0.22)',
        },
      },

      // ── Typography ──────────────────────────────────────────────────────
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      fontWeight: {
        light:    '300',
        normal:   '400',
        medium:   '500',
        semibold: '600',
        bold:     '700',
        extrabold:'800',
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem',    letterSpacing: '0.02em' }],
        xs:    ['0.75rem',  { lineHeight: '1.125rem' }],
        sm:    ['0.875rem', { lineHeight: '1.4rem' }],
        base:  ['1rem',     { lineHeight: '1.6rem' }],
        lg:    ['1.125rem', { lineHeight: '1.75rem' }],
        xl:    ['1.25rem',  { lineHeight: '1.875rem', letterSpacing: '-0.01em' }],
        '2xl': ['1.5rem',   { lineHeight: '2rem',     letterSpacing: '-0.02em' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem',  letterSpacing: '-0.025em' }],
        '4xl': ['2.25rem',  { lineHeight: '2.5rem',   letterSpacing: '-0.03em' }],
        '5xl': ['3rem',     { lineHeight: '1',         letterSpacing: '-0.04em' }],
      },
      letterSpacing: {
        tightest: '-0.04em',
        tighter:  '-0.025em',
        tight:    '-0.01em',
        normal:    '0em',
        wide:      '0.025em',
        wider:     '0.05em',
        widest:    '0.1em',
      },

      // ── Radii ───────────────────────────────────────────────────────────
      borderRadius: {
        sm:      '0.25rem',   //  4px
        DEFAULT: '0.375rem',  //  6px
        md:      '0.5rem',    //  8px
        lg:      '0.625rem',  // 10px
        xl:      '0.875rem',  // 14px
        '2xl':   '1.125rem',  // 18px
        full:    '9999px',
      },

      // ── Spacing extras ──────────────────────────────────────────────────
      spacing: {
        4.5:  '1.125rem',
        5.5:  '1.375rem',
        13:   '3.25rem',
        15:   '3.75rem',
        18:   '4.5rem',
        22:   '5.5rem',
      },

      // ── Shadows — layered, perceptually balanced ────────────────────────
      boxShadow: {
        xs:      '0 1px 2px rgba(15, 23, 42, 0.04)',
        sm:      '0 1px 3px rgba(15, 23, 42, 0.07), 0 1px 2px rgba(15, 23, 42, 0.04)',
        DEFAULT: '0 2px 6px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(15, 23, 42, 0.05)',
        md:      '0 4px 12px rgba(15, 23, 42, 0.09), 0 2px 5px rgba(15, 23, 42, 0.05)',
        lg:      '0 10px 24px rgba(15, 23, 42, 0.10), 0 4px 8px rgba(15, 23, 42, 0.05)',
        xl:      '0 20px 40px rgba(15, 23, 42, 0.12), 0 8px 16px rgba(15, 23, 42, 0.06)',
        accent:  '0 0 0 3px rgba(37, 99, 235, 0.18)',
        danger:  '0 0 0 3px rgba(220, 38, 38, 0.18)',
        inner:   'inset 0 1px 3px rgba(15, 23, 42, 0.06)',
        none:    'none',
      },

      // ── Transitions ─────────────────────────────────────────────────────
      transitionDuration: {
        75:  '75ms',
        100: '100ms',
        150: '150ms',
        200: '200ms',
        300: '300ms',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        out:    'cubic-bezier(0, 0, 0.2, 1)',
      },

      // ── Ring widths ─────────────────────────────────────────────────────
      ringWidth: {
        DEFAULT: '2px',
        1: '1px',
        2: '2px',
        3: '3px',
      },
    },
  },
  plugins: [],
};
