import { expect, test, type Page } from '@playwright/test';

const accountId = process.env.E2E_PORTFOLIO_ACCOUNT ?? 'greenghost.testnet';
const portfolioPath = `/@${accountId}`;
const standingIncomingPath = `${portfolioPath}/standing/incoming`;

/** Next Link is SSR'd as a plain anchor until hydration; wait before clicking. */
async function waitForClientNavigationReady(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(
    () => document.body.dataset.portfolioClientReady === 'true'
  );
}

async function closeStandingDrawer(page: Page) {
  await page.getByRole('button', { name: 'Close Standing' }).click();
}

async function openStandingFromProfile(page: Page) {
  await waitForClientNavigationReady(page);

  const standingLink = page
    .locator('a[href*="/standing/incoming"]')
    .first();
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

async function openDiscoverFromStandingDrawer(page: Page) {
  await page
    .getByRole('link', { name: 'Discover profiles to stand with' })
    .click();
  await page.waitForURL(new RegExp(`/discover`));
}

async function switchStandingView(page: Page, label: string) {
  await page.getByRole('button', { name: 'Open standing view menu' }).click();
  await page.getByRole('option', { name: label }).click();
}

test.describe('portfolio glass navigation', () => {
  test('hard refresh on standing URL shows full page without visible glass', async ({
    page,
  }) => {
    await page.goto(standingIncomingPath, { waitUntil: 'networkidle' });

    await expect(page.locator('.standing-page-screen')).toBeVisible();
    await expect(page.locator('[data-testid="overlay-intercept-slot"]')).toHaveCount(
      0
    );
    await expect(page.locator('.glass-sheet-root.is-visible')).toHaveCount(0);
  });

  test.describe('soft intercept from profile', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(portfolioPath, { waitUntil: 'networkidle' });
      await expect(page.locator('.portfolio-identity')).toBeVisible();
    });

    test('standing link opens drawer over portfolio', async ({ page }) => {
      await openStandingFromProfile(page);

      await expect(page.locator('.standing-page-screen')).toHaveCount(0);
      await expect(page.locator('.glass-sheet-root.is-visible')).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.locator('.standing-panel')).toBeVisible();
      await expect(page.locator('.portfolio-identity')).toBeVisible();
      await expect(page.locator('.standing-list-skeleton')).toHaveCount(0);
    });

    test('close standing drawer returns to portfolio', async ({ page }) => {
      await openStandingFromProfile(page);
      await expect(page.locator('.glass-sheet-root.is-visible')).toBeVisible({
        timeout: 10_000,
      });

      await closeStandingDrawer(page);

      await expect(page).toHaveURL(new RegExp(`${portfolioPath.replace('.', '\\.')}$`));
      await expect(page.locator('.glass-sheet-root.is-visible')).toHaveCount(0);
    });

    test('reopen standing drawer after close', async ({ page }) => {
      await openStandingFromProfile(page);
      await expect(page.locator('.glass-sheet-root.is-visible')).toBeVisible({
        timeout: 10_000,
      });

      await closeStandingDrawer(page);
      await expect(page).toHaveURL(new RegExp(`${portfolioPath.replace('.', '\\.')}$`));
      await expect(page.locator('.glass-sheet-root.is-visible')).toHaveCount(0);

      await openStandingFromProfile(page);

      await expect(page.locator('.standing-page-screen')).toHaveCount(0);
      await expect(page.locator('.glass-sheet-root.is-visible')).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.locator('.standing-panel')).toBeVisible();
    });

    test('standing to discover swaps in the same glass sheet', async ({ page }) => {
      await openStandingFromProfile(page);
      await expect(page.locator('.glass-sheet-root.is-visible')).toBeVisible({
        timeout: 10_000,
      });

      await openDiscoverFromStandingDrawer(page);

      await expect(page.locator('.discover-panel')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open standing view menu' })).toHaveCount(
        0
      );
      await expect(page.locator('.glass-sheet-root.is-visible')).toBeVisible();
      await expect(page.locator('.portfolio-identity')).toBeVisible();
    });

    test('one close after standing tab switch returns to portfolio', async ({
      page,
    }) => {
      await openStandingFromProfile(page);
      await expect(page.locator('.glass-sheet-root.is-visible')).toBeVisible({
        timeout: 10_000,
      });

      await switchStandingView(page, 'They stand with');
      await page.waitForURL(new RegExp(`/standing/outgoing`));

      await closeStandingDrawer(page);

      await expect(page).toHaveURL(new RegExp(`${portfolioPath.replace('.', '\\.')}$`));
      await expect(page.locator('.glass-sheet-root.is-visible')).toHaveCount(0);
    });
  });
});
