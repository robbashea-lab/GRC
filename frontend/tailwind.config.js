/** @type {import('tailwindcss').Config} */
module.exports = {
  blocklist: ["overline"],
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      colors: {
        // shadcn/ui tokens
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',

        // Brand palette
        brand: {
          charcoal: 'var(--color-brand-charcoal)',
          'charcoal-hover': 'var(--color-brand-charcoal-hover)',
          'charcoal-active': 'var(--color-brand-charcoal-active)',
          metallic: 'var(--color-brand-metallic)',
          'metallic-2': 'var(--color-brand-metallic-2)',
          'metallic-3': 'var(--color-brand-metallic-3)',
          lime: 'var(--color-brand-lime)',
        },

        // Surfaces & neutral chrome
        surface: {
          app: 'var(--color-bg-app)',
          card: 'var(--color-bg-surface)',
          subtle: 'var(--color-bg-subtle)',
        },
        line: {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-strong)',
          input: 'var(--color-input-border)',
        },
        ink: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          help: 'var(--color-text-help)',
          disabled: 'var(--color-text-disabled)',
          onDark: 'var(--color-text-on-dark)',
          onDark2: 'var(--color-text-on-dark-2)',
          onDarkMuted: 'var(--color-text-on-dark-muted)',
        },

        // Interactive
        link: {
          DEFAULT: 'var(--color-link)',
          hover: 'var(--color-link-hover)',
        },
        focus: 'var(--color-focus-ring)',
        selected: {
          bg: 'var(--color-selected-bg)',
          rail: 'var(--color-selected-rail)',
        },

        // Semantic
        semantic: {
          'critical': 'var(--color-critical)',
          'critical-bg': 'var(--color-critical-bg)',
          'critical-border': 'var(--color-critical-border)',
          'moderate': 'var(--color-moderate)',
          'moderate-bg': 'var(--color-moderate-bg)',
          'moderate-text': 'var(--color-moderate-text)',
          'moderate-border': 'var(--color-moderate-border)',
          'duesoon': 'var(--color-duesoon)',
          'duesoon-bg': 'var(--color-duesoon-bg)',
          'duesoon-text': 'var(--color-duesoon-text)',
          'duesoon-border': 'var(--color-duesoon-border)',
          'success': 'var(--color-success)',
          'success-bg': 'var(--color-success-bg)',
          'success-border': 'var(--color-success-border)',
          'info': 'var(--color-info)',
          'info-bg': 'var(--color-info-bg)',
          'info-border': 'var(--color-info-border)',
          'neutral': 'var(--color-neutral)',
          'neutral-bg': 'var(--color-neutral-bg)',
          'neutral-border': 'var(--color-neutral-border)',
        },

        ai: 'var(--color-ai)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up':   { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
};
