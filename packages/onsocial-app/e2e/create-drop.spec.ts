import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';

/**
 * New drop maker chrome — title, dock leave, work-then-deal field order.
 * Does not submit a drop.
 */
test.describe('create drop', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem('onsocial.drop-form-draft.v1');
      window.localStorage.removeItem('onsocial.drop-pin-draft.v2');
      window.localStorage.removeItem('onsocial.drop-pin-draft.v1');
    });
  });

  test('titles New drop and leaves to Drops', async ({ page }) => {
    await gotoApp(page, '/market/create');

    await expect(
      page.getByRole('heading', { level: 1, name: 'New drop' })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(page).toHaveTitle(/New drop • OnSocial/);
    await expect(page.locator('.drop-create-form')).toHaveAttribute(
      'data-drop-create-back',
      '/drops'
    );
    await expect(page.locator('.drop-kind-rail')).toBeVisible();
    await expect(page.locator('.market-listing-filters')).toHaveCount(0);
    await expect(page.locator('.os-app-screen')).toHaveAttribute(
      'data-header-owns-connect',
      ''
    );
    await expect(page.locator('.portfolio-summon-hint--connect')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Connect', exact: true })
    ).toHaveCount(1);

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL(/\/drops(?:\?|$)/);
  });

  test('orders work, title, deal, then description', async ({ page }) => {
    await gotoApp(page, '/market/create');
    await expect(page.locator('.drop-create-form')).toHaveAttribute(
      'data-drop-create-ready',
      '',
      { timeout: E2E_CHROME_TIMEOUT_MS }
    );

    const order = await page
      .locator('[data-drop-create-section]')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-drop-create-section'))
      );
    expect(order).toEqual(['work', 'title', 'deal', 'description']);

    await expect(
      page
        .locator('[data-drop-create-section="work"]')
        .getByRole('radiogroup', { name: 'Artwork mode' })
    ).toBeVisible();
    await expect(
      page
        .locator('[data-drop-create-section="work"]')
        .getByText('Artwork', { exact: true })
    ).toHaveCount(0);
    await expect(page.locator('.drop-create-piece')).toBeVisible();
    await expect(
      page.locator('[data-drop-create-section="title"] #drop-create-title')
    ).toBeVisible();
    await expect(page.locator('.drop-create-stage')).toBeVisible();
    await expect(page.locator('.drop-create-deal-line')).toBeVisible();
    await expect(
      page
        .locator('[data-drop-create-section="deal"]')
        .getByLabel('Total supply')
    ).toBeVisible();
    await expect(
      page
        .locator('[data-drop-create-section="deal"]')
        .getByLabel('Price per edition in NEAR')
    ).toBeVisible();
    await expect(page.locator('.drop-create-deal-sep')).toHaveText('·');
    await expect(page.getByRole('group', { name: 'Quick prices' })).toHaveCount(
      0
    );
    await expect(page.getByRole('group', { name: 'Total supply' })).toHaveCount(
      0
    );
    await expect(page.locator('.drop-create-blurb-toggle')).toHaveText(
      'Add a blurb'
    );
    await expect(page.locator('#drop-create-description')).toHaveCount(0);

    await page.locator('.drop-create-blurb-toggle').click({ force: true });
    await expect(page.locator('#drop-create-description')).toBeVisible();
  });

  test('hub bind leaves to that hub; series query still prefills', async ({
    page,
  }) => {
    await gotoApp(page, '/market/create?app=e2e-hub&series=Audit+Series');
    await expect(
      page.getByRole('heading', { level: 1, name: 'New drop' })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(page.locator('.drop-create-form')).toHaveAttribute(
      'data-drop-create-back',
      '/apps/e2e-hub'
    );
    await expect(page.locator('.drop-create-form')).toHaveAttribute(
      'data-drop-create-series',
      'Audit Series'
    );
  });
});
