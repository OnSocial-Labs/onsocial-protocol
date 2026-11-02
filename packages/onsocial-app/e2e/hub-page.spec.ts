import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';
import { seedE2eWallet } from './helpers/collection-page';
import { COLLECTIBLES_VAULT_OWNER } from './helpers/collectibles-vault';
import { setE2eGraphHub } from './helpers/e2e-graph';
import { HUB_E2E_PATH, HUB_E2E_TITLE, stubHubPage } from './helpers/hub-page';

const HOLDER_BACK = `/@${COLLECTIBLES_VAULT_OWNER}/collectibles`;

test.describe('hub page', () => {
  test('guest list uses Collect/Open and hides resale chrome', async ({
    page,
  }) => {
    await setE2eGraphHub(page, 'catalog');
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
    ).toContainText('Alice');
    await expect(
      page.locator('.series-shop-row').filter({ hasText: 'Quiet Print' })
    ).toContainText('Bob');
    await expect(
      page.getByRole('button', { name: 'Request to publish' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Hub settings' })
    ).toHaveCount(0);
    await expect(page.locator('.app-drop-card')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /Resale/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open Market' })).toHaveCount(
      0
    );
    await expect(
      page.getByRole('link', { name: 'Shop all on Market' })
    ).toHaveCount(0);
    await expect(page.locator('a[href*="?app="]')).toHaveCount(0);
    await expect(
      page.getByText('4 drops · 12 minted · 6 holders · 4.0 NEAR')
    ).toBeVisible();

    await page.getByRole('button', { name: /View roster/ }).click();
    const creators = page.getByRole('dialog').filter({
      has: page.getByRole('button', { name: 'Close creators' }),
    });
    await expect(
      creators.getByRole('link', { name: 'Alice Owner @alice.near' })
    ).toBeVisible();
    await expect(
      creators.locator('.standing-row-name-row .guild-member-role-badge')
    ).toHaveText('Owner');
    await expect(creators.locator('.hub-people-role')).toHaveCount(0);
  });

  test('SSR catalog hit paints Audit Hub without the skeleton', async ({
    page,
  }) => {
    await setE2eGraphHub(page, 'catalog');
    await stubHubPage(page, { rows: 'catalog' });
    await gotoApp(page, HUB_E2E_PATH);
    await expect(page.locator('[data-hub-page-skeleton]')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: HUB_E2E_TITLE }).first()
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Collect Night Drive' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Open Quiet Print' })
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
    await expect(page.locator('[data-hub-page-skeleton]')).toBeVisible({
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
    await setE2eGraphHub(page, 'held');
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
    await expect(
      page.getByRole('link', { name: 'Play Dusk Run' })
    ).toBeVisible();
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
    await setE2eGraphHub(page, 'staff');
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
    await expect(
      page
        .locator('.app-page-hero')
        .getByRole('button', { name: 'Hub settings' })
    ).toBeVisible();
    await expect(
      page
        .locator('.os-app-screen-header')
        .getByRole('button', { name: 'Hub settings' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Request to publish' })
    ).toHaveCount(0);
    await expect(
      page.getByText('Only hub staff can publish here.')
    ).toHaveCount(0);
    const walkthrough = process.env.E2E_WALKTHROUGH_DIR;
    if (walkthrough) {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(
        page
          .locator('.app-page-hero')
          .getByRole('button', { name: 'Hub settings' })
      ).toBeVisible();
      await page.screenshot({
        path: `${walkthrough}/hub-hero-staff-gear.png`,
      });
    }
    await page
      .locator('.app-page-hero')
      .getByRole('button', { name: 'Hub settings' })
      .click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  });

  test('approval hub asks to publish from the hero plus', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setE2eGraphHub(page, 'approval');
    await stubHubPage(page, { rows: 'catalog', access: 'approval' });
    await gotoApp(page, HUB_E2E_PATH);

    const request = page.getByRole('button', { name: 'Request to publish' });
    await expect(request).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(page.getByText('Approval', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Hub settings' })
    ).toHaveCount(0);
    await expect(
      page
        .locator('.os-app-screen-header')
        .getByRole('button', { name: 'Request to publish' })
    ).toHaveCount(0);

    const walkthrough = process.env.E2E_WALKTHROUGH_DIR;
    if (walkthrough) {
      await page.screenshot({ path: `${walkthrough}/hub-hero-approval.png` });
      await page.setViewportSize({ width: 1280, height: 800 });
      await expect(request).toBeVisible();
      await page.screenshot({
        path: `${walkthrough}/hub-hero-approval-desktop.png`,
      });
    }
  });

  test('signed-in visitor opens publish access from the hero plus', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedE2eWallet(page, 'cara.near');
    await page.route('**/api/near/rpc', async (route) => {
      const body = route.request().postDataJSON() as {
        params?: { method_name?: string };
      };
      if (body.params?.method_name === 'get_publish_request') {
        const bytes = Array.from(Buffer.from('null', 'utf8'));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'onsocial-bff',
            result: { result: bytes },
          }),
        });
        return;
      }
      await route.continue();
    });
    await setE2eGraphHub(page, 'approval');
    await stubHubPage(page, { rows: 'catalog', access: 'approval' });
    await gotoApp(page, HUB_E2E_PATH);

    const request = page.getByRole('button', { name: 'Request to publish' });
    await expect(request).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await request.click();
    const sheet = page.getByRole('dialog', { name: 'Publish access' });
    await expect(sheet).toBeVisible();
    await expect(sheet).not.toHaveClass(/glass-sheet-panel--enter/);
    await expect(
      sheet.getByRole('button', { name: 'Request access' })
    ).toBeVisible();
    await expect(
      sheet.getByPlaceholder('What would you publish here?')
    ).toBeVisible();
    const walkthrough = process.env.E2E_WALKTHROUGH_DIR;
    if (walkthrough) {
      await sheet.locator('.hub-manage-form').screenshot({
        path: `${walkthrough}/hub-publish-access-sheet.png`,
      });
    }
    await sheet.getByRole('button', { name: 'Close publish access' }).click();
    await expect(sheet).toBeHidden();
    await expect(request).toBeVisible();
  });

  test('empty hub does not offer a Market shop door', async ({ page }) => {
    await setE2eGraphHub(page, 'empty');
    await stubHubPage(page, { rows: 'empty' });
    await gotoApp(page, HUB_E2E_PATH);

    await expect(
      page.getByRole('heading', { name: HUB_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(page.getByText('No drops in this hub yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse Market' })).toHaveCount(
      0
    );
    await expect(page.getByRole('link', { name: 'Open Market' })).toHaveCount(
      0
    );
    await expect(page.locator('a[href*="?app="]')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /Resale/ })).toHaveCount(0);
  });

  test('document title includes Hub · OnSocial', async ({ page }) => {
    await setE2eGraphHub(page, 'empty');
    await stubHubPage(page, { rows: 'empty' });
    await gotoApp(page, HUB_E2E_PATH);
    await expect(page).toHaveTitle(/Hub • OnSocial/, {
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
  });
});
