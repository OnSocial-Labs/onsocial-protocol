import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup-vitest.js'],
    globals: true,
    environment: 'node',
  },
});
