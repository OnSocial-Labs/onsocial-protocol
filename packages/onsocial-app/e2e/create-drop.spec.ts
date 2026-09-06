import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';

/**
 * New drop maker chrome — title, dock leave, work-then-deal field order.
 * Does not submit a drop.
 */
test.describe('create drop', () => {
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

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL(/\/drops(?:\?|$)/);
  });

  test('orders work, title, deal, then description', async ({ page }) => {
    await gotoApp(page, '/market/create');
    await expect(page.locator('.drop-create-form')).toBeVisible({
      timeout: E2E_CHROME_TIMEOUT_MS,
    });

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
      page.locator('[data-drop-create-section="title"] #drop-create-title')
    ).toBeVisible();
    await expect(
      page
        .locator('[data-drop-create-section="deal"]')
        .getByText('Price per edition')
    ).toBeVisible();
    await expect(
      page.locator('[data-drop-create-section="description"] textarea')
    ).toBeVisible();
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

    await page.getByRole('button', { name: 'Advanced' }).click();
    await expect(page.locator('#drop-create-series')).toHaveValue(
      'Audit Series'
    );
  });
});
