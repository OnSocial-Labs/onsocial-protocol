import { expect, test, type Page } from '@playwright/test';
import {
  E2E_CHROME_TIMEOUT_MS,
  expectConnectVoice,
  gotoApp,
  setLookPreviewFile,
} from './helpers';

/**
 * New drop maker chrome. Does not submit a drop (no wallet).
 */
const COVER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function openCreateDrop(
  page: Page,
  path = '/drops/create'
): Promise<void> {
  await gotoApp(page, path);
  await expect(page.locator('.drop-create-form')).toHaveAttribute(
    'data-drop-create-ready',
    '',
    { timeout: E2E_CHROME_TIMEOUT_MS }
  );
}

test.describe('create drop', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem('onsocial.drop-form-draft.v1');
      window.localStorage.removeItem('onsocial.drop-pin-draft.v2');
      window.localStorage.removeItem('onsocial.drop-pin-draft.v1');
    });
  });

  test('titles New drop and leaves to Drops', async ({ page }) => {
    await gotoApp(page, '/home');
    await gotoApp(page, '/drops/create');

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
    await expectConnectVoice(page);
    await expect(
      page.getByRole('button', { name: 'Start drop', exact: true })
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL(/\/drops(?:\?|$)/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'New drop' })
    ).toHaveCount(0);
  });

  test('dirty dock Back asks before leaving', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/home');
    await openCreateDrop(page);
    await expect(
      page.getByRole('heading', { level: 1, name: 'New drop' })
    ).toBeVisible();
    await page.locator('#drop-create-title').fill('Builders');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    const discard = page.getByRole('dialog', { name: 'Discard draft?' });
    await expect(discard).toBeVisible();
    await discard
      .locator('.os-sheet-action--primary')
      .filter({ hasText: 'Keep editing' })
      .click();
    await expect(discard).toHaveCount(0);
    await expect(page).toHaveURL(/\/drops\/create\/?$/);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Discard draft?' })).toBeVisible();
    await page
      .locator('.os-sheet-action--danger')
      .filter({ hasText: 'Discard draft' })
      .click();
    await page.waitForURL(/\/drops(?:\?|$)/, { timeout: 15_000 });
    await expect(
      page.getByRole('heading', { level: 1, name: 'New drop' })
    ).toHaveCount(0);
  });

  test('legacy /market/create redirects to /drops/create', async ({ page }) => {
    await gotoApp(page, '/market/create?series=Night+Roads');
    await page.waitForURL(/\/drops\/create/, {
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await expect(page).toHaveURL(/\/drops\/create\?series=Night(\+|%20)Roads/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'New drop' })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
  });

  test('orders work, title, deal, then description', async ({ page }) => {
    await openCreateDrop(page);

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
    await expect(page.locator('.drop-kind-lede')).toHaveCount(0);
    await expect(
      page.locator('[data-drop-create-section="title"] #drop-create-title')
    ).toBeVisible();
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

    await expect(page.locator('.drop-create-description-toggle')).toHaveText(
      'Add a description'
    );
    await expect(page.locator('#drop-create-description')).toHaveCount(0);
    await page.getByRole('button', { name: 'Add a description' }).click();
    await expect(page.locator('#drop-create-description')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'About Description' })
    ).toBeVisible();
    await page.locator('#drop-create-description').fill('Short public line.');
    await page.getByRole('button', { name: 'Hide description' }).click();
    await expect(page.locator('#drop-create-description')).toHaveCount(0);
    await expect(page.locator('.drop-create-description-toggle')).toHaveText(
      'Edit description'
    );
  });

  test('keeps the artwork well square when a photo is picked', async ({
    page,
  }) => {
    await openCreateDrop(page);
    await expect(page.locator('.drop-create-piece')).toBeVisible();
    const pieceBox = await page.locator('.drop-create-piece').boundingBox();
    expect(pieceBox).toBeTruthy();
    expect(pieceBox!.width / pieceBox!.height).toBeCloseTo(1, 1);
    expect(pieceBox!.width).toBeLessThan(320);

    await setLookPreviewFile(
      page,
      'input.scarce-cover-file-input',
      {
        name: 'art.png',
        mimeType: 'image/png',
        buffer: COVER_PNG,
      },
      page.locator('.drop-create-piece.has-media')
    );
    const filledBox = await page
      .locator('.drop-create-piece.has-media')
      .boundingBox();
    expect(filledBox).toBeTruthy();
    expect(filledBox!.width / filledBox!.height).toBeCloseTo(1, 1);
    expect(filledBox!.width).toBeCloseTo(pieceBox!.width, 1);
    await expect(page.locator('.drop-cover-seat-grid')).toHaveCount(0);
  });

  test('names Audio and Writing attach on the piece', async ({ page }) => {
    await openCreateDrop(page);

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
  });

  test('opens Advanced extras in house-field sheets', async ({ page }) => {
    await openCreateDrop(page);
    await page.getByRole('button', { name: 'Advanced', exact: true }).click();

    await expect(
      page.getByRole('button', { name: 'Drop ID: From title' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Series: None' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Style: None' })
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
      page.getByRole('button', { name: 'Destroy: No' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Renewals: No' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Allowlist: Connect' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'About Allowlist' })
    ).toHaveCount(0);
    await expect(
      page.locator('.drop-create-extra-list .divider-item')
    ).not.toHaveCount(0);
    await expect(page.locator('#drop-create-id')).toHaveCount(0);

    await page.getByRole('button', { name: 'Drop ID: From title' }).click();
    const dropId = page.getByRole('dialog', { name: 'Drop ID' });
    await expect(dropId.locator('#drop-create-id')).toBeVisible();
    await expect(dropId.locator('#drop-create-id')).toHaveClass(
      /os-field-bordered/
    );
    await expect(
      dropId.getByRole('button', { name: 'About Drop ID' })
    ).toHaveCount(0);
    await expect(
      dropId.getByText('Filled from your title — edit only for a custom link.')
    ).toBeVisible();
    await dropId.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.locator('#drop-create-id')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Drop ID: From title' })
    ).toBeVisible();
  });

  test('Sale sheet is the window, not per wallet or transferable', async ({
    page,
  }) => {
    await openCreateDrop(page);
    await page.getByRole('button', { name: 'Advanced', exact: true }).click();

    await page.getByRole('button', { name: 'Sale: Now · no end' }).click();
    const sale = page.getByRole('dialog', { name: 'Sale' });
    await expect(sale.getByText('When collectors can mint.')).toBeVisible();
    await expect(sale.getByText('Opens', { exact: true })).toBeVisible();
    await expect(sale.getByText('Closes', { exact: true })).toBeVisible();
    await expect(sale.getByText('Max per wallet', { exact: true })).toHaveCount(
      0
    );
    await expect(
      sale.getByRole('radiogroup', { name: 'Transferable' })
    ).toHaveCount(0);
    await sale.getByRole('button', { name: 'Done', exact: true }).click();

    await page.getByRole('button', { name: 'Per wallet: No limit' }).click();
    const perWallet = page.getByRole('dialog', { name: 'Per wallet' });
    await expect(
      perWallet.getByText('Cap how many one wallet can collect.')
    ).toBeVisible();
    await expect(
      perWallet.getByLabel('Max editions per wallet')
    ).toBeVisible();
    await expect(perWallet.getByText('Opens', { exact: true })).toHaveCount(0);
    await perWallet.getByRole('button', { name: 'Done', exact: true }).click();

    await page.getByRole('button', { name: 'Transferable: Yes' }).click();
    const transferable = page.getByRole('dialog', { name: 'Transferable' });
    await expect(
      transferable.getByText('Yes means they can resell. Soulbound stays with them.')
    ).toBeVisible();
    await expect(
      transferable.getByRole('radiogroup', { name: 'Transferable' })
    ).toBeVisible();
    await expect(transferable.getByText('Opens', { exact: true })).toHaveCount(
      0
    );
    await transferable.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Transferable: Yes' })
    ).toBeVisible();
  });

  test('Destroy defaults to No and can be turned on', async ({ page }) => {
    await openCreateDrop(page);
    await page.getByRole('button', { name: 'Advanced', exact: true }).click();

    await expect(
      page.getByRole('button', { name: 'Destroy: No' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Destroy: No' }).click();
    const destroy = page.getByRole('dialog', { name: 'Destroy' });
    await expect(
      destroy.getByText('No keeps the edition. Yes lets the holder destroy it.')
    ).toBeVisible();
    await expect(
      destroy.getByRole('radiogroup', { name: 'Destroy' })
    ).toBeVisible();
    await expect(
      destroy.getByRole('radio', { name: 'No', exact: true })
    ).toBeChecked();
    await destroy.getByRole('radio', { name: 'Yes', exact: true }).click();
    await destroy.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Destroy: Yes' })
    ).toBeVisible();
  });

  test('tickets show Event and Postpone in Advanced', async ({ page }) => {
    await openCreateDrop(page);
    await page.getByRole('tab', { name: 'Tickets', exact: true }).click();
    await expect(page.locator('.drop-kind-lede')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Hide advanced' })
    ).toBeVisible();
    await expect(page.getByText('Starts', { exact: true })).toBeVisible();
    await expect(page.getByText('Ends', { exact: true })).toBeVisible();
    await expect(page.locator('.drop-create-extra-list')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'About Event' })).toHaveCount(
      0
    );
    await expect(
      page.getByText('When the show runs — not the sale.')
    ).toBeVisible();
    await expect(page.getByText('Event window', { exact: true })).toHaveCount(
      0
    );
    await expect(
      page.getByRole('button', { name: 'Place: None' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Postpone: Yes' })
    ).toBeVisible();
    await expect(
      page.getByRole('radio', { name: 'Flexible dates', exact: true })
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Postpone: Yes' }).click();
    const postpone = page.getByRole('dialog', { name: 'Postpone' });
    await expect(
      postpone.getByRole('button', { name: 'About Postpone' })
    ).toHaveCount(0);
    await expect(
      postpone.getByText('Push the event end later if the show moves.')
    ).toBeVisible();
    await expect(
      postpone.getByRole('radio', { name: 'Yes', exact: true })
    ).toBeChecked();
    await expect(
      postpone.getByRole('radio', { name: 'No', exact: true })
    ).toBeVisible();
    await postpone.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Postpone: Yes' })
    ).toBeVisible();
  });

  test('coupons and membership tell the truth on renewals', async ({
    page,
  }) => {
    await openCreateDrop(page);

    await page.getByRole('tab', { name: 'Coupons', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Renewals: Yes · set an end' })
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Renewals: Yes · set an end' })
      .click();
    const renewals = page.getByRole('dialog', { name: 'Renewals' });
    await expect(
      renewals.getByRole('button', { name: 'About Renewals' })
    ).toHaveCount(0);
    await expect(
      renewals.getByText('Holders can renew after it expires.')
    ).toBeVisible();
    await renewals.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Renewals: Yes · set an end' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Transferable: Yes' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Destroy: No' })
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
    await openCreateDrop(page, '/drops/create?app=e2e-hub&series=Audit+Series');
    await expect(
      page.getByRole('heading', { level: 1, name: 'New drop' })
    ).toBeVisible();
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
    const series = page.getByRole('dialog', { name: 'Series' });
    await expect(series.locator('#drop-create-series')).toHaveClass(
      /os-field-bordered/
    );
    await expect(series.locator('#drop-create-series')).toHaveValue(
      'Audit Series'
    );
    await expect(
      series.getByRole('button', { name: 'About Series' })
    ).toHaveCount(0);
    await expect(
      series.getByText('Optional — group later drops under one name.')
    ).toBeVisible();
    await series.getByRole('button', { name: 'Done', exact: true }).click();
  });

  test('Art Advanced Style and Royalty stay their own sheets', async ({
    page,
  }) => {
    await openCreateDrop(page);
    await page.getByRole('button', { name: 'Advanced', exact: true }).click();

    await page.getByRole('button', { name: 'Style: None' }).click();
    const style = page.getByRole('dialog', { name: 'Style' });
    await expect(style.locator('.drop-facets-chip-row')).toBeVisible();
    await style.getByRole('button', { name: 'Generative', exact: true }).click();
    await style.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Style: Generative' })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Royalty: 10%' }).click();
    const royalty = page.getByRole('dialog', { name: 'Royalty' });
    await expect(
      royalty.getByRole('group', { name: 'Resale royalty' })
    ).toBeVisible();
    await royalty.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Royalty: 10%' })
    ).toBeVisible();
  });
});
