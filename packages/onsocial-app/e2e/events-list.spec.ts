import { expect, test } from '@playwright/test';
import { setE2eGraphDrops } from './helpers/e2e-graph';
import { gotoApp } from './helpers';

test('a two dollar ticket shows $2 and the row opens', async ({ page }) => {
  await setE2eGraphDrops(page, 'events');
  await gotoApp(page, '/events');

  const create = page
    .locator('.os-app-screen-actions')
    .getByRole('link', { name: 'New event' });
  await expect(create).toBeVisible();
  await expect(create).toHaveClass(/os-sheet-action/);
  const createBox = await create.boundingBox();
  expect(createBox && createBox.height).toBeGreaterThan(24);
  expect(createBox && createBox.height).toBeLessThan(34);

  const row = page
    .locator('.drops-discovery-row')
    .filter({ hasText: 'Gate Pass' });
  await expect(row).toBeVisible();
  await expect(row.getByText('$2')).toBeVisible();
  await expect(row.getByText('Lisbon')).toBeVisible();
  await expect(row.getByText('Free')).toHaveCount(0);
  await expect(row.locator('.market-listing-row-open')).toHaveAttribute(
    'href',
    '/collection/gate-pass'
  );

  const frost = await page
    .locator('.drops-screen-body > .os-chrome-glass')
    .evaluate((el) => getComputedStyle(el, '::before').content);
  expect(frost).toBe('none');

  const price = await row.getByText('$2').boundingBox();
  expect(price).toBeTruthy();
  await page.mouse.click(price!.x + 8, price!.y + price!.height / 2);
  await expect(page).toHaveURL(/\/collection\/gate-pass(?:\?|$)/);
});
