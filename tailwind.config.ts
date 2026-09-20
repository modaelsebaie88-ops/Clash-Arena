import type { Config } from 'tailwindcss';

/**
 * Clash Arena - broadcast arena tokens.
 * The system is dark-only by design, so colours are literal rather than themed.
 * See DESIGN.md for the reasoning behind every value here.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '20px', sm: '24px', lg: '32px' },
      screens: { '2xl': '1200px' },
    },
    extend: {
      colors: {
        // Stage
        ink: '#08090A',
        pit: '#0E1012',
        deck: '#16181B',
        ridge: '#1E2125',
        rail: '#2A2E34',
        // Ink on stage
        chalk: '#F4F5F3',
        smoke: '#9BA1A8',
        ghost: '#606770',
        // Brand
        volt: {
          DEFAULT: '#CCFF00',
          deep: '#A8D400',
          ink: '#08090A',
        },
        blaze: {
          DEFAULT: '#FF5C1A',
          deep: '#D94100',
        },
        // Semantic
        win: '#2BE07A',
        loss: '#FF2E4C',
        flag: '#FFC531',
        // Podium
        gold: '#FFC531',
        silver: '#C6CBD1',
        bronze: '#D08B45',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Impact', 'Haettenschweiler', 'sans-serif'],
        data: ['var(--font-data)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-ui)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        kicker: ['0.6875rem', { lineHeight: '1.2', letterSpacing: '0.18em', fontWeight: '700' }],
        label: ['0.8125rem', { lineHeight: '1.3', letterSpacing: '0.06em', fontWeight: '600' }],
        action: ['1rem', { lineHeight: '1', letterSpacing: '0.1em', fontWeight: '800' }],
      },
      borderRadius: {
        none: '0px',
        xs: '4px',
        sm: '8px',
        DEFAULT: '12px',
        md: '12px',
        lg: '18px',
        full: '9999px',
      },
      spacing: {
        gutter: '20px',
        section: '40px',
        'safe-b': 'env(safe-area-inset-bottom, 0px)',
        'nav-h': '80px',
      },
      boxShadow: {
        volt: '0 0 0 1px #CCFF00, 0 8px 32px -12px rgba(204, 255, 0, 0.5)',
        lift: '0 12px 32px -20px rgba(0, 0, 0, 0.9)',
      },
      keyframes: {
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.86)' },
          '60%': { opacity: '1', transform: 'scale(1.04)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'critical-pulse': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.045)' },
        },
        'live-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.25' },
        },
        'stripe-scroll': {
          from: { backgroundPosition: '0 0' },
          to: { backgroundPosition: '40px 0' },
        },
        'sweep': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(100%)' },
        },
        'ticker-up': {
          from: { opacity: '0', transform: 'translateY(100%)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'rise-in': 'rise-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'pop-in': 'pop-in 340ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'critical-pulse': 'critical-pulse 1s ease-in-out infinite',
        'live-blink': 'live-blink 1.4s ease-in-out infinite',
        'stripe-scroll': 'stripe-scroll 1s linear infinite',
        sweep: 'sweep 1.6s ease-in-out infinite',
        'ticker-up': 'ticker-up 300ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;
