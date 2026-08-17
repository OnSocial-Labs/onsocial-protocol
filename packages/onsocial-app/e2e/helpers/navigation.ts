import { expect, test, type Locator, type Page } from '@playwright/test';

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

/** Visible glass sheet (soft intercept), via UI `GlassSheet` class contract. */
export function glassSheetVisible(page: Page): Locator {
  return page.locator('.glass-sheet-root.is-visible');
}

export async function expectGlassSheetVisible(
  page: Page,
  opts?: { timeout?: number }
): Promise<void> {
  await expect(glassSheetVisible(page)).toBeVisible({
    timeout: opts?.timeout ?? 10_000,
  });
}

export async function expectGlassSheetHidden(page: Page): Promise<void> {
  await expect(glassSheetVisible(page)).toHaveCount(0);
}

/**
 * Soft-open standing from the portfolio face.
 * Waits for RSC soft-nav when present (not a hard navigation).
 */
export async function openStandingFromProfile(page: Page): Promise<void> {
  await waitForPortfolioClientReady(page);

  const standingLink = page.locator('a[href*="/standing/incoming"]').first();
  await expect(standingLink).toBeVisible();

  const softNav = page
    .waitForResponse(
      (resp) =>
        resp.request().method() === 'GET' &&
        (resp.url().includes('_rsc') ||
          resp.headers()['content-type']?.includes('text/x-component') ===
            true),
      { timeout: 15_000 }
    )
    .catch(() => null);

  await standingLink.click();
  await softNav;
  await page.waitForURL(new RegExp(`/standing/incoming`));
}

export async function closeStandingDrawer(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: 'Close Standing', exact: true })
    .click();
}

export async function openDiscoverFromStandingDrawer(page: Page): Promise<void> {
  await page
    .getByRole('link', { name: 'Discover profiles to stand with' })
    .click();
  await page.waitForURL(new RegExp(`/discover`));
}

export async function switchStandingView(
  page: Page,
  label: string
): Promise<void> {
  await page.getByRole('button', { name: 'Open standing menu' }).click();
  await page.getByRole('option', { name: label }).click();
}
