import { expect, test, type Page } from '@playwright/test';

/** Default visibility timeout for app chrome smokes. */
export const E2E_CHROME_TIMEOUT_MS = 30_000;

/**
 * Navigate to an app path with a consistent wait strategy.
 * Prefer `domcontentloaded` — `networkidle` hangs under parallel e2e.
 */
export async function gotoApp(
  page: Page,
  path: string,
  opts?: { waitUntil?: 'domcontentloaded' | 'load' | 'networkidle' }
): Promise<void> {
  await page.goto(path, {
    waitUntil: opts?.waitUntil ?? 'domcontentloaded',
  });
}

/**
 * Portfolio soft-nav is SSR'd as plain anchors until hydration marks ready.
 */
export async function waitForPortfolioClientReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.body.dataset.portfolioClientReady === 'true',
    undefined,
    { timeout: E2E_CHROME_TIMEOUT_MS }
  );
}

/**
 * Wait for portfolio identity or skip when the e2e account is missing.
 */
export async function expectPortfolioIdentityOrSkip(
  page: Page,
  accountId: string
): Promise<void> {
  const missing = page.getByRole('heading', { name: 'Account not found' });
  const identity = page.locator('.portfolio-identity');
  await Promise.race([
    identity.waitFor({ state: 'visible', timeout: E2E_CHROME_TIMEOUT_MS }),
    missing.waitFor({ state: 'visible', timeout: E2E_CHROME_TIMEOUT_MS }),
  ]).catch(() => null);
  if (await missing.isVisible()) {
    test.skip(true, `Portfolio account ${accountId} not found on this network`);
  }
  await expect(identity).toBeVisible({ timeout: 5_000 });
}

/** Standing hard-refresh shell, or skip when the account is missing. */
export async function expectStandingPageOrSkip(
  page: Page,
  accountId: string
): Promise<void> {
  const missing = page.getByRole('heading', { name: 'Account not found' });
  const standing = page.locator('.standing-page-screen');
  await Promise.race([
    standing.waitFor({ state: 'visible', timeout: E2E_CHROME_TIMEOUT_MS }),
    missing.waitFor({ state: 'visible', timeout: E2E_CHROME_TIMEOUT_MS }),
  ]).catch(() => null);
  if (await missing.isVisible()) {
    test.skip(true, `Portfolio account ${accountId} not found on this network`);
  }
  await expect(standing).toBeVisible({ timeout: 5_000 });
}
