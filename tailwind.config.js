const colors = require('tailwindcss/colors');

module.exports = {
  purge: {
    // The FormEngine fragment is injected by the {% formApp %} shortcode, so its
    // utility classes appear in no .njk source. The tailwind theme is where they
    // are written as literals; scanning it keeps them from being purged.
    content: ['./src/**/*.njk', './src/**/*.svg', './src/assets/js/form-engine/themes/tailwind.js'],
    layers: ['components', 'utilities'],
    options: {
      safelist: ['header-shadow', '-translate-y-full', 'hidden']
    }
  },
  theme: {
    screens: {
      sm: '576px',
      md: '768px',
      lg: '1024px',
      xl: '1280px'
    },
    extend: {
      // Colors are *extended* (not replaced): the site's own palette (custom
      // gray, teal) is kept, and Tailwind's default palette (blue, green, red,
      // amber, cyan, ...) stays available. The form engine's tailwind theme
      // paints controls, buttons, badges and feedback with those defaults, so
      // replacing the palette here would leave them colorless.
      colors: {
        transparent: 'transparent',
        current: 'currentColor',
        black: colors.black,
        white: colors.white,
        gray: {
           50: '#fbfbfd',
          100: '#f7fafc',
          200: '#edf2f7',
          300: '#e2e8f0',
          400: '#cbd5e0',
          500: '#a0aec0',
          600: '#718096',
          700: '#4a5568',
          800: '#2d3748',
          900: '#1a202c'
        },
        // Tailwind v2.2's default palette has no `amber`/`cyan`; the form theme
        // uses them for the Bootstrap warning/info variants, so pull them in.
        amber: colors.amber,
        cyan: colors.cyan,
        teal: colors.teal
      },
      // Bootstrap `offset-*` becomes `ml-*` (see the tailwind theme's twCol()),
      // but Tailwind v2's margin scale has no fractional keys, so `ml-1/4`
      // would generate nothing. Mirror the width fractions here.
      margin: {
        '1/12': '8.333333%',
        '1/6': '16.666667%',
        '1/4': '25%',
        '1/3': '33.333333%',
        '5/12': '41.666667%',
        '1/2': '50%',
        '7/12': '58.333333%',
        '2/3': '66.666667%',
        '3/4': '75%',
        '5/6': '83.333333%',
        '11/12': '91.666667%',
        'full': '100%'
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            'h1': {
              fontWeight: '700'
            },
            'blockquote': {
              fontWeight: 'normal',
              color: theme('colors.gray.700')
            },  
            'blockquote p:first-of-type::before': {
              content: ''
            },
            'blockquote p:last-of-type::after': {
              content: ''
            }
          }
        }
      }),
      maxWidth: {
        '1/2': '50%',
        '1/3': '33.333333%',
        '2/3': '66.666667%',
        '1/4': '25%',
        '2/4': '50%',
        '3/4': '75%',
        '1/5': '20%',
        '2/5': '40%',
        '3/5': '60%',
        '4/5': '80%',
        '1/6': '16.666667%',
        '2/6': '33.333333%',
        '3/6': '50%',
        '4/6': '66.666667%',
        '5/6': '83.333333%',
        '1/12': '8.333333%',
        '2/12': '16.666667%',
        '3/12': '25%',
        '4/12': '33.333333%',
        '5/12': '41.666667%',
        '6/12': '50%',
        '7/12': '58.333333%',
        '8/12': '66.666667%',
        '9/12': '75%',
        '10/12': '83.333333%',
        '11/12': '91.666667%',
      },
    },
    listStyleType: {
        none: 'none',
        disc: 'disc',
        square: 'square',
        upperroman: 'upper-roman',
        lowerroman: 'lower-roman',
        circle: 'circle',
        triangle: 'disclosure-closed',
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ]
};
