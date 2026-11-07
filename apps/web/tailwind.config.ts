import type { Config } from 'tailwindcss';

/**
 * Tokens de marca (ver "Sistema de diseño" en la hoja de ruta).
 * Primario (rojo por defecto) para la acción, acento (dorado) para el énfasis, neutros cálidos
 * para el resto. El admin global cambia primario y acento desde Apariencia.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Colores de marca configurables (Apariencia): variables CSS con canales RGB que
        // fija lib/marca.ts. Los nombres red/gold se conservan; ahora son primario y acento.
        brand: {
          red: 'rgb(var(--marca-primario) / <alpha-value>)',
          'red-dark': 'rgb(var(--marca-primario-oscuro) / <alpha-value>)',
          gold: 'rgb(var(--marca-acento) / <alpha-value>)',
          'gold-soft': 'rgb(var(--marca-acento-suave) / <alpha-value>)',
        },
        ink: { DEFAULT: '#1F1A17', soft: '#2B2420', muted: '#6B625C' },
        canvas: '#F7F5F2',
        line: '#E7E2DC',
        ok: '#2E9E5B',
        warn: '#E8890C',
        danger: '#B3261E',
      },
      fontFamily: {
        // Archivo con eje de anchura: condensada para números de pedido y cifras grandes
        display: ['"Archivo Variable"', 'Archivo', 'system-ui', 'sans-serif'],
        sans: ['"Figtree Variable"', 'Figtree', 'system-ui', 'sans-serif'],
      },
      borderRadius: { ticket: '6px' },
      keyframes: {
        destello: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '35%': { transform: 'scale(1.08)', opacity: '1' },
          '55%': { transform: 'scale(0.98)' },
          '75%': { transform: 'scale(1.03)' },
          '100%': { transform: 'scale(1)' },
        },
        entra: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        destello: 'destello 900ms ease-out',
        entra: 'entra 180ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
