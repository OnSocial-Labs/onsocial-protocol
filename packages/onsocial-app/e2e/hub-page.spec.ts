import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';
import { seedE2eWallet } from './helpers/collection-page';
import { COLLECTIBLES_VAULT_OWNER } from './helpers/collectibles-vault';
import {
  HUB_E2E_PATH,
  HUB_E2E_TITLE,
  stubHubPage,
} from './helpers/hub-page';

const HOLDER_BACK = `/@${COLLECTIBLES_VAULT_OWNER}/collectibles`;

test.describe('hub page', () => {
  test('guest list uses Collect/Open and hides resale chrome', async ({
    page,
  }) => {
    await stubHubPage(page, { rows: 'catalog' });
    await gotoApp(page, HUB_E2E_PATH);

    await expect(
      page.getByRole('heading', { name: HUB_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });

    const root = page.locator('.app-page');
    await expect(root).not.toHaveClass(/is-use-first/);
    await expect(root).toHaveAttribute('data-hub-back', '/apps');
    await expect(
      page.getByRole('link', { name: 'Open Collectibles' })
    ).toHaveCount(0);

    await expect(
      page.getByRole('link', { name: 'Collect Night Drive' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Open Quiet Print' })
    ).toBeVisible();
    await expect(
      page.locator('.series-shop-row').filter({ hasText: 'Night Drive' })
    ).toContainText('@alice.near');
    await expect(
      page.locator('.series-shop-row').filter({ hasText: 'Quiet Print' })
    ).toContainText('@bob.near');
    await expect(page.locator('.app-drop-card')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /Resale/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open Market' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Shop all on Market' })).toHaveCount(
      0
    );
    await expect(page.locator('a[href*="?app="]')).toHaveCount(0);
    await expect(
      page.getByText('4 drops · 12 minted · 6 holders · 4.0 NEAR')
    ).toBeVisible();
  });

  test('SSR catalog miss keeps the skeleton until the client fetch settles', async ({
    page,
  }) => {
    await stubHubPage(page, {
      rows: 'catalog',
      catalogDelayMs: 2500,
    });
    await gotoApp(page, HUB_E2E_PATH);
    await expect(page.locator('[data-hub-page-skeleton]').first()).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByText('No drops in this hub yet.')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Collect Night Drive' })
    ).toBeVisible({ timeout: 12_000 });
    await expect(page.locator('[data-hub-page-skeleton]')).toHaveCount(0);
    await expect(page.locator('.app-drop-card')).toHaveCount(0);
  });

  test('held hub puts Play rows and Collectibles back above shop', async ({
    page,
  }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await stubHubPage(page, { rows: 'catalog', held: true });
    await gotoApp(page, HUB_E2E_PATH);

    const root = page.locator('.app-page');
    await expect(root).toHaveClass(/is-use-first/, {
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await expect(root).toHaveAttribute('data-hub-use-first', '');
    await expect(root).toHaveAttribute('data-hub-back', HOLDER_BACK);
    await expect(
      page.getByRole('link', { name: 'Open Collectibles' })
    ).toHaveAttribute('href', HOLDER_BACK);
    await expect(
      page.getByRole('link', { name: 'Play Night Drive' })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Play Dusk Run' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Open Quiet Print' })
    ).toBeVisible();
    await expect(page.getByText('No drops in this hub yet.')).toHaveCount(0);
    await expect(
      page.getByText('4 drops · 12 minted · 6 holders · 4.0 NEAR')
    ).toHaveCount(0);
    await expect(page.locator('.app-drop-card')).toHaveCount(0);
  });

  test('staff without holdings keep create chrome, not vault chrome', async ({
    page,
  }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await stubHubPage(page, {
      rows: 'catalog',
      ownerId: COLLECTIBLES_VAULT_OWNER,
    });
    await gotoApp(page, HUB_E2E_PATH);

    const root = page.locator('.app-page');
    await expect(root).not.toHaveClass(/is-use-first/, {
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await expect(root).toHaveAttribute('data-hub-back', '/apps');
    await expect(
      page.getByRole('link', { name: 'Open Collectibles' })
    ).toHaveCount(0);
    await expect(
      page.getByText('4 drops · 12 minted · 6 holders · 4.0 NEAR')
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Collect Night Drive' })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hub settings' })).toBeVisible();
    await expect(
      page.getByText('Only hub staff can publish here.')
    ).toHaveCount(0);
  });

  test('empty hub does not offer a Market shop door', async ({ page }) => {
    await stubHubPage(page, { rows: 'empty' });
    await gotoApp(page, HUB_E2E_PATH);

    await expect(
      page.getByRole('heading', { name: HUB_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(page.getByText('No drops in this hub yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse Market' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open Market' })).toHaveCount(0);
    await expect(page.locator('a[href*="?app="]')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /Resale/ })).toHaveCount(0);
  });

  test('document title includes Hub · OnSocial', async ({ page }) => {
    await stubHubPage(page, { rows: 'empty' });
    await gotoApp(page, HUB_E2E_PATH);
    await expect(page).toHaveTitle(/Hub • OnSocial/, {
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
  });
});
