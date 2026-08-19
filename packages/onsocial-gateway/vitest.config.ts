import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Gateway .env sets DATABASE_URL for dev; unit tests must use in-memory
    // stores (same as CI) so check:push does not require gateway migrations.
    env: {
      DATABASE_URL: '',
    },
  },
});
