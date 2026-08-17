import { expect, test, type Page } from '@playwright/test';
import {
  expectPortfolioIdentityOrSkip,
  expectStandingPageOrSkip,
  gotoApp,
  waitForPortfolioClientReady,
} from './helpers';

const accountId = process.env.E2E_PORTFOLIO_ACCOUNT ?? 'greenghost.testnet';
const portfolioPath = `/@${accountId}`;
const standingIncomingPath = `${portfolioPath}/standing/incoming`;

async function closeStandingDrawer(page: Page) {
  await page
    .getByRole('button', { name: 'Close Standing', exact: true })
    .click();
}

async function openStandingFromProfile(page: Page) {
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

async function openDiscoverFromStandingDrawer(page: Page) {
  await page
    .getByRole('link', { name: 'Discover profiles to stand with' })
    .click();
  await page.waitForURL(new RegExp(`/discover`));
}

async function switchStandingView(page: Page, label: string) {
  await page.getByRole('button', { name: 'Open standing menu' }).click();
  await page.getByRole('option', { name: label }).click();
}

test.describe('portfolio glass navigation', () => {
  // Soft-nav suite shares live profile state — run one at a time.
  test.describe.configure({ mode: 'serial' });

  test('hard refresh on standing URL shows full page without visible glass', async ({
    page,
  }) => {
    await gotoApp(page, standingIncomingPath);
    await expectStandingPageOrSkip(page, accountId);

    await expect(
      page.locator('[data-testid="overlay-intercept-slot"]')
    ).toHaveCount(0);
    await expect(page.locator('.glass-sheet-root.is-visible')).toHaveCount(0);
  });

  test.describe('soft intercept from profile', () => {
    test.beforeEach(async ({ page }) => {
      await gotoApp(page, portfolioPath);
      await expectPortfolioIdentityOrSkip(page, accountId);
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

      await expect(page).toHaveURL(
        new RegExp(`${portfolioPath.replace('.', '\\.')}$`)
      );
      await expect(page.locator('.glass-sheet-root.is-visible')).toHaveCount(0);
    });

    test('reopen standing drawer after close', async ({ page }) => {
      await openStandingFromProfile(page);
      await expect(page.locator('.glass-sheet-root.is-visible')).toBeVisible({
        timeout: 10_000,
      });

      await closeStandingDrawer(page);
      await expect(page).toHaveURL(
        new RegExp(`${portfolioPath.replace('.', '\\.')}$`)
      );
      await expect(page.locator('.glass-sheet-root.is-visible')).toHaveCount(0);

      await openStandingFromProfile(page);

      await expect(page.locator('.standing-page-screen')).toHaveCount(0);
      await expect(page.locator('.glass-sheet-root.is-visible')).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.locator('.standing-panel')).toBeVisible();
    });

    test('standing to discover swaps in the same glass sheet', async ({
      page,
    }) => {
      await openStandingFromProfile(page);
      await expect(page.locator('.glass-sheet-root.is-visible')).toBeVisible({
        timeout: 10_000,
      });

      await openDiscoverFromStandingDrawer(page);

      await expect(page.locator('.discover-panel')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Open standing menu' })
      ).toHaveCount(0);
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

      await expect(page).toHaveURL(
        new RegExp(`${portfolioPath.replace('.', '\\.')}$`)
      );
      await expect(page.locator('.glass-sheet-root.is-visible')).toHaveCount(0);
    });
  });
});
