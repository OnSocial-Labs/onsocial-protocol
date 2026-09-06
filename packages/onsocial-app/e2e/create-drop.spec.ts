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
    await expect(page.locator('.portfolio-summon-hint--connect')).toHaveCount(
      0
    );
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

    await page.getByRole('tab', { name: 'Audio', exact: true }).click();
    await expect(
      page.locator('[data-drop-create-attach="audio"]')
    ).toBeVisible();
    await expect(page.locator('.drop-create-attach-action')).toHaveText(
      'Add track'
    );
    await expect(
      page
        .locator('[data-drop-create-section="work"]')
        .getByText('Track', { exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole('group', { name: 'Track actions' })
    ).toHaveCount(0);
    await page.getByRole('radio', { name: 'Album' }).click();
    await expect(page.locator('.drop-create-attach-action')).toHaveText(
      'Add tracks'
    );

    await page.getByRole('tab', { name: 'Writing', exact: true }).click();
    await expect(
      page.locator('[data-drop-create-attach="writing"]')
    ).toBeVisible();
    await expect(page.locator('.drop-create-attach-action')).toHaveText(
      'Add file'
    );
    await expect(
      page.getByRole('group', { name: 'Issue file actions' })
    ).toHaveCount(0);

    await page.getByRole('radio', { name: 'Book' }).click();
    await expect(page.locator('.drop-create-attach-action')).toHaveText(
      'Add files'
    );
    await expect(
      page.locator('[data-drop-create-attach="book-pdf"]')
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Add PDF', exact: true })
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Advanced', exact: true }).click();
    await expect(
      page.locator('[data-drop-create-attach="book-pdf"]')
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-drop-create-attach="book-pdf"] .drop-create-attach-action'
      )
    ).toHaveText('Add PDF');
    await expect(page.getByText('Book PDF', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('group', { name: 'Book PDF actions' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Drop ID: From title' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Series: None' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Subject: None' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Royalty: 10%' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Sale: Now · no end' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Per wallet: No limit' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Transferable: Yes' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Renewals: No' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Allowlist: Connect' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'About Allowlist' })
    ).toBeVisible();
    await expect(
      page.locator('.drop-create-extra-list .divider-item')
    ).not.toHaveCount(0);
    await expect(page.locator('#drop-create-id')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Set a drop ID', exact: true })
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Drop ID: From title' }).click();
    await expect(page.locator('#drop-create-id')).toBeVisible();
    await expect(page.locator('#drop-create-id')).toHaveClass(
      /os-field-bordered/
    );
    await expect(
      page.getByRole('button', { name: 'About Drop ID' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.locator('#drop-create-id')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Drop ID: From title' })
    ).toBeVisible();

    await page.locator('.drop-create-blurb-toggle').click({ force: true });
    await expect(page.locator('#drop-create-description')).toBeVisible();
  });

  test('tickets name date-change pills in Advanced', async ({ page }) => {
    await gotoApp(page, '/market/create');
    await expect(page.locator('.drop-create-form')).toHaveAttribute(
      'data-drop-create-ready',
      '',
      { timeout: E2E_CHROME_TIMEOUT_MS }
    );
    await page.getByRole('tab', { name: 'Tickets', exact: true }).click();
    await expect(page.locator('.drop-kind-lede')).toHaveText(
      /Event entry — one redeem per ticket/
    );
    await expect(
      page.getByRole('button', { name: 'Hide advanced' })
    ).toBeVisible();
    await expect(page.getByText('Starts', { exact: true })).toBeVisible();
    await expect(page.getByText('Ends', { exact: true })).toBeVisible();
    await expect(page.locator('.drop-create-extra-list')).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: 'About Event' })
    ).toBeVisible();
    await expect(page.getByText('Event window', { exact: true })).toHaveCount(
      0
    );
    await expect(
      page.getByRole('button', { name: 'Transferable: Yes' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Place: None' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'About Allowlist' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Postpone: Yes' })
    ).toBeVisible();
    await expect(
      page.getByRole('radio', { name: 'Flexible dates', exact: true })
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Postpone: Yes' }).click();
    await expect(
      page.getByRole('button', { name: 'About Postpone' })
    ).toBeVisible();
    await expect(
      page.getByText('Can you push the event end later if the show moves?')
    ).toHaveCount(0);
    await expect(
      page.getByRole('radio', { name: 'Yes', exact: true })
    ).toBeChecked();
    await expect(
      page.getByRole('radio', { name: 'No', exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Postpone: Yes' })
    ).toBeVisible();

    await page.getByRole('tab', { name: 'Coupons', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Renewals: Yes · set an end' })
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Renewals: Yes · set an end' })
      .click();
    await expect(
      page.getByRole('button', { name: 'About Renewals' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Renewals: Yes · set an end' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Transferable: Yes' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Allowlist: Connect' })
    ).toBeVisible();

    await page.getByRole('tab', { name: 'Membership', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Transferable: Soulbound' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Renewals: Yes' })
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
    await expect(page.locator('.drop-create-form')).toHaveAttribute(
      'data-drop-create-series',
      'Audit Series'
    );
    await page.getByRole('button', { name: 'Advanced', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Series: Audit Series' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Series: Audit Series' }).click();
    await expect(page.locator('#drop-create-series')).toHaveClass(
      /os-field-bordered/
    );
    await expect(page.locator('#drop-create-series')).toHaveValue(
      'Audit Series'
    );
    await expect(
      page.getByRole('button', { name: 'About Series' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Style: None' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Style: None' }).click();
    await expect(page.locator('.drop-facets-chip-row')).toBeVisible();
    await page.getByRole('button', { name: 'Generative', exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Style: Generative' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Royalty: 10%' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Royalty: 10%' }).click();
    await expect(
      page.getByRole('group', { name: 'Resale royalty' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Sale: Now · no end' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Sale: Now · no end' }).click();
    await expect(
      page.getByRole('button', { name: 'About Sale window' })
    ).toBeVisible();
    await expect(page.getByText('Opens', { exact: true })).toBeVisible();
    await expect(page.getByText('Closes', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Max per wallet', { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'About Transferable' })
    ).toBeVisible();
    await expect(
      page.getByRole('radiogroup', { name: 'Transferable' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Sale: Now · no end' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Per wallet: No limit' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Transferable: Yes' })
    ).toBeVisible();
  });
});
