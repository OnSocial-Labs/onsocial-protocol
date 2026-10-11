import { expect, test } from '@playwright/test';
import { E2E_MARKET_CREATOR } from '../src/lib/e2e-graph-stubs';
import { seedE2eWallet } from './helpers/collection-page';
import { setE2eGraphMarket } from './helpers/e2e-graph';
import { expectMarketChrome } from './helpers/market';
import { stubMarketLiveFirstBrowse } from './helpers/market-live-first';
import { dismissNextDevOverlay, gotoApp } from './helpers/navigation';
import { SIGNED_CHROME_VIEWER } from './helpers/signed-journey-chrome';

test('offer sheet header is the verb and the owner is the body face', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedE2eWallet(page, SIGNED_CHROME_VIEWER);
  await setE2eGraphMarket(page, 'live-first');
  await stubMarketLiveFirstBrowse(page);
  await gotoApp(page, '/market');
  await expectMarketChrome(page);
  await dismissNextDevOverlay(page);

  const search = page.getByRole('textbox', { name: 'Search Market listings' });
  await search.fill('e2e-live-first');
  const liveRow = page.locator(
    '#market-listing-results [data-market-listing-group="live"] .market-listing-row'
  );
  await liveRow.getByRole('button', { name: /^Buy / }).click();

  const buy = page.getByRole('dialog', { name: /^Buy/ });
  await expect(buy).toBeVisible();
  await buy.getByRole('button', { name: 'Make an offer' }).click();

  const sheet = page.getByRole('dialog', { name: /^Offer / });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.gesture-sheet-verb')).toHaveText('Offer');
  await expect(sheet.locator('.gesture-sheet-person')).toHaveCount(0);
  await expect(sheet.locator('.gesture-sheet-handle')).toHaveCount(0);
  await expect(sheet.locator('.scarce-buy-party-handle')).toHaveText(
    `@${E2E_MARKET_CREATOR}`
  );
  await expect
    .poll(async () => (await sheet.boundingBox())?.y ?? 9999)
    .toBeLessThan(700);
});
