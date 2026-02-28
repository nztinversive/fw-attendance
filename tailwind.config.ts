import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#B8860B',
          light: '#D4A830',
          dark: '#8B6508',
        },
      },
    },
  },
  plugins: [],
};
export default config;
