// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // allows font-[EB_Garamond] class in Tailwind
        'EB_Garamond': ['"EB Garamond"', 'serif'],
      },
    },
  },
  plugins: [],
}

export default config