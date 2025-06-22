import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts', './tests/setup-vitest.js'],
    include: ['tests/**/*.ts', 'tests/**/*.tsx'],
  },
});
