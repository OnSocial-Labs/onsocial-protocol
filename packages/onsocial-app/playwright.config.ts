import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 3099);
const host = process.env.E2E_HOST ?? 'localhost';
const baseURL = process.env.E2E_BASE_URL ?? `http://${host}:${port}`;
const useNextStart =
  process.env.CI === 'true' || process.env.E2E_NEXT_START === '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 60_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: process.env.E2E_VIDEO === '1' ? 'on' : undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: useNextStart
          ? `pnpm run build:deps && pnpm exec next build && pnpm exec next start --port ${port}`
          : `pnpm run build:deps && pnpm exec next dev --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
        env: {
          ...process.env,
          NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? '.next-e2e',
          E2E_HOME_SSR_MISS: '1',
          ONSOCIAL_API_KEY:
            process.env.ONSOCIAL_API_KEY ?? 'ci-e2e-placeholder',
          NEXT_PUBLIC_NEAR_NETWORK:
            process.env.NEXT_PUBLIC_NEAR_NETWORK ?? 'testnet',
          E2E_GRAPH_STUBS: '1',
          ...(useNextStart ? { NEXT_PUBLIC_E2E_WALLET: '1' } : {}),
        },
      },
});
