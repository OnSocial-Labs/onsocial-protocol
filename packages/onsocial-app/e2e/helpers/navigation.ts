import { expect, test, type Locator, type Page } from '@playwright/test';

/** Default visibility timeout for app chrome smokes. */
export const E2E_CHROME_TIMEOUT_MS = 30_000;

type NextDebugRouter = {
  push: (href: string) => void;
};

declare global {
  interface Window {
    next?: { router?: NextDebugRouter };
  }
}

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

async function waitForPortfolioReadyFlag(
  page: Page,
  timeout: number
): Promise<void> {
  await page.waitForFunction(
    () => document.body.dataset.portfolioClientReady === 'true',
    undefined,
    { timeout }
  );
}

/**
 * Portfolio soft-nav is SSR'd as plain anchors until hydration marks ready.
 * First paint can miss the flag while Next is still compiling `/[accountId]` —
 * dismiss the overlay and reload once if it never appears.
 */
export async function waitForPortfolioClientReady(page: Page): Promise<void> {
  await dismissNextDevOverlay(page);
  try {
    await waitForPortfolioReadyFlag(page, 15_000);
    return;
  } catch {
    await dismissNextDevOverlay(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissNextDevOverlay(page);
    await waitForPortfolioReadyFlag(page, E2E_CHROME_TIMEOUT_MS);
  }
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

/** Logged-out chrome: at least one Connect, never “Connect wallet”. */
export async function expectConnectVoice(page: Page): Promise<void> {
  await expect(page.getByText('Connect wallet')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Connect', exact: true }).first()
  ).toBeVisible();
}

/** Next.js dev overlay intercepts clicks during compile. */
export async function dismissNextDevOverlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll('nextjs-portal').forEach((node) => node.remove());
  });
}

type LookPreviewFile = {
  name: string;
  mimeType: string;
  buffer: Buffer;
};

/**
 * Hidden look-file inputs miss `change` while Next is compiling other routes.
 * Dismiss the overlay and retry once if the confirm control never appears.
 */
export async function setLookPreviewFile(
  page: Page,
  input: Locator | string,
  file: LookPreviewFile,
  confirm: Locator
): Promise<void> {
  const fileInput = typeof input === 'string' ? page.locator(input) : input;
  await expect(fileInput).toBeAttached();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await dismissNextDevOverlay(page);
    await fileInput.setInputFiles(file);
    try {
      await expect(confirm).toBeVisible({ timeout: 8_000 });
      return;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
    }
  }
}

async function softOpenPortfolioHref(page: Page, href: string): Promise<void> {
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

  await page.evaluate((nextHref) => {
    const router = window.next?.router;
    if (!router?.push) {
      throw new Error('Next router missing — cannot open portfolio overlay');
    }
    router.push(nextHref);
  }, href);
  await softNav;
}

/**
 * Soft-open standing from the portfolio face.
 * Zero-signal faces hide the standing metric — open the overlay the same way
 * Link does when the row is absent.
 */
export async function openStandingFromProfile(
  page: Page,
  accountId: string
): Promise<void> {
  await waitForPortfolioClientReady(page);

  const standingHref = `/@${encodeURIComponent(accountId)}/standing/incoming`;
  const standingLink = page.locator(`a[href*="/standing/incoming"]`).first();
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

  if (await standingLink.isVisible().catch(() => false)) {
    await standingLink.click();
    await softNav;
  } else {
    await softOpenPortfolioHref(page, standingHref);
  }
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
