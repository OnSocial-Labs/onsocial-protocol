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

    await page.getByRole('tab', { name: 'Audio', exact: true }).click();
    await expect(page.locator('[data-drop-create-attach="audio"]')).toBeVisible();
    await expect(page.locator('.drop-create-attach-action')).toHaveText(
      'Add track'
    );
    await expect(
      page
        .locator('[data-drop-create-section="work"]')
        .getByText('Track', { exact: true })
    ).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Track actions' })).toHaveCount(
      0
    );
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
    await expect(page.locator('[data-drop-create-attach="book-pdf"]')).toHaveCount(
      0
    );
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
    await expect(page.getByText('Drop ID', { exact: true })).toHaveCount(0);
    await expect(
      page.getByText('Series (optional)', { exact: true })
    ).toHaveCount(0);
    await expect(page.locator('#drop-create-id')).toHaveCount(0);
    await expect(page.locator('#drop-create-series')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Set a drop ID', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add to a series', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add a subject', exact: true })
    ).toBeVisible();
    await expect(page.getByText('Subject', { exact: true })).toHaveCount(0);
    await expect(page.locator('.drop-facets-chip-row')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Set a royalty', exact: true })
    ).toBeVisible();
    await expect(page.getByText('Resale royalty', { exact: true })).toHaveCount(
      0
    );
    await expect(
      page.getByRole('group', { name: 'Resale royalty' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Set sale rules', exact: true })
    ).toBeVisible();
    await expect(page.getByText('Sale window', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Opens', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Closes', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Max per wallet', { exact: true })).toHaveCount(
      0
    );
    await expect(page.getByText('Transferable', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Set renewals', exact: true })
    ).toBeVisible();
    await expect(page.getByText('Renewable', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Add an allowlist', exact: true })
    ).toBeVisible();
    await expect(page.getByText('Allowlist', { exact: true })).toHaveCount(0);
    await expect(
      page.getByText('Max redeems (optional)', { exact: true })
    ).toHaveCount(0);

    await page
      .getByRole('button', { name: 'Set a drop ID', exact: true })
      .click();
    await expect(page.locator('#drop-create-id')).toBeVisible();

    await page.locator('.drop-create-blurb-toggle').click({ force: true });
    await expect(page.locator('#drop-create-description')).toBeVisible();

    await page.getByRole('tab', { name: 'Tickets', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Event window' })).toBeVisible();
    await expect(page.getByText('Starts', { exact: true })).toBeVisible();
    await expect(page.getByText('Ends', { exact: true })).toBeVisible();
    await expect(page.getByText('Event window', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Add a place', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('radiogroup', { name: 'Allow date changes' })
    ).toBeVisible();
    await expect(
      page.getByRole('radio', { name: 'Flexible dates', exact: true })
    ).toBeChecked();
    await expect(
      page.getByRole('radio', { name: 'Fixed date', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Allow date changes', exact: true })
    ).toHaveCount(0);
    await expect(page.getByText('Allow date changes', { exact: true })).toHaveCount(
      0
    );
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
    await expect(page.locator('#drop-create-series')).toHaveValue(
      'Audit Series'
    );
    await expect(
      page.getByRole('button', { name: 'Add to a series', exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Add a style', exact: true })
    ).toBeVisible();
    await expect(page.locator('.drop-facets-chip-row')).toHaveCount(0);
    await page.getByRole('button', { name: 'Add a style', exact: true }).click();
    await expect(page.locator('.drop-facets-chip-row')).toBeVisible();
    await expect(page.getByText('Style', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Set a royalty', exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Set a royalty', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Resale royalty' })).toBeVisible();
    await expect(page.getByText('Resale royalty', { exact: true })).toHaveCount(
      0
    );
    await expect(
      page.getByRole('button', { name: 'Set sale rules', exact: true })
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Set sale rules', exact: true })
      .click();
    await expect(page.getByText('Opens', { exact: true })).toBeVisible();
    await expect(page.getByText('Closes', { exact: true })).toBeVisible();
    await expect(page.getByText('Now', { exact: true })).toBeVisible();
    await expect(page.getByText('No end', { exact: true })).toBeVisible();
    await expect(page.getByText('Sale window', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Max per wallet', { exact: true })).toHaveCount(
      0
    );
    await expect(
      page.getByRole('radiogroup', { name: 'Transferable' })
    ).toBeVisible();
    await expect(page.getByText('Transferable', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Set renewals', exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Set renewals', exact: true }).click();
    await expect(
      page.getByRole('radiogroup', { name: 'Renewable' })
    ).toBeVisible();
    await expect(page.getByText('Renewable', { exact: true })).toHaveCount(0);
  });
});
