import { expect, test } from '@playwright/test';
import {
  closeStandingDrawer,
  expectGlassSheetHidden,
  expectGlassSheetVisible,
  expectPortfolioIdentityOrSkip,
  expectStandingPageOrSkip,
  gotoApp,
  openDiscoverFromStandingDrawer,
  openStandingFromProfile,
  switchStandingView,
} from './helpers';

const accountId = process.env.E2E_PORTFOLIO_ACCOUNT ?? 'greenghost.testnet';
const portfolioPath = `/@${accountId}`;
const standingIncomingPath = `${portfolioPath}/standing/incoming`;

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
    await expectGlassSheetHidden(page);
  });

  test.describe('soft intercept from profile', () => {
    test.beforeEach(async ({ page }) => {
      await gotoApp(page, portfolioPath);
      await expectPortfolioIdentityOrSkip(page, accountId);
    });

    test('standing link opens drawer over portfolio', async ({ page }) => {
      await openStandingFromProfile(page);

      await expect(page.locator('.standing-page-screen')).toHaveCount(0);
      await expectGlassSheetVisible(page);
      await expect(page.locator('.standing-panel')).toBeVisible();
      await expect(page.locator('.portfolio-identity')).toBeVisible();
      await expect(page.locator('.standing-list-skeleton')).toHaveCount(0);
    });

    test('close standing drawer returns to portfolio', async ({ page }) => {
      await openStandingFromProfile(page);
      await expectGlassSheetVisible(page);

      await closeStandingDrawer(page);

      await expect(page).toHaveURL(
        new RegExp(`${portfolioPath.replace('.', '\\.')}$`)
      );
      await expectGlassSheetHidden(page);
    });

    test('reopen standing drawer after close', async ({ page }) => {
      await openStandingFromProfile(page);
      await expectGlassSheetVisible(page);

      await closeStandingDrawer(page);
      await expect(page).toHaveURL(
        new RegExp(`${portfolioPath.replace('.', '\\.')}$`)
      );
      await expectGlassSheetHidden(page);

      await openStandingFromProfile(page);

      await expect(page.locator('.standing-page-screen')).toHaveCount(0);
      await expectGlassSheetVisible(page);
      await expect(page.locator('.standing-panel')).toBeVisible();
    });

    test('standing to discover opens full page', async ({ page }) => {
      await openStandingFromProfile(page);
      await expectGlassSheetVisible(page);

      await openDiscoverFromStandingDrawer(page);

      await expectGlassSheetHidden(page);
      await expect(page.locator('.discover-panel')).toBeVisible();
      await expect(page.locator('.os-app-screen')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Open standing menu' })
      ).toHaveCount(0);
    });

    test('one close after standing tab switch returns to portfolio', async ({
      page,
    }) => {
      await openStandingFromProfile(page);
      await expectGlassSheetVisible(page);

      await switchStandingView(page, 'They stand with');
      await page.waitForURL(new RegExp(`/standing/outgoing`));

      await closeStandingDrawer(page);

      await expect(page).toHaveURL(
        new RegExp(`${portfolioPath.replace('.', '\\.')}$`)
      );
      await expectGlassSheetHidden(page);
    });
  });
});
