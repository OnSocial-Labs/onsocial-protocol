import { expect, test } from '@playwright/test';
import {
  dismissNextDevOverlay,
  gotoApp,
  waitForPortfolioClientReady,
} from './helpers/navigation';

const ACCOUNT = 'alice.testnet';

test('profile offer sits under the name and opens Message', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/offers**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('accountIds')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ titles: { [ACCOUNT]: 'Brand identity' } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        offers: [
          {
            offerId: 'o-1',
            title: 'Brand identity',
            line: 'Marks and type.',
            url: 'https://studio.example/book',
            since: 1,
          },
        ],
      }),
    });
  });

  await gotoApp(page, `/@${ACCOUNT}`);
  await waitForPortfolioClientReady(page);
  const identity = page.locator('.portfolio-identity');
  if (!(await identity.isVisible().catch(() => false))) {
    test.skip(true, `Portfolio account ${ACCOUNT} not found`);
  }
  await dismissNextDevOverlay(page);

  const offer = identity.getByRole('button', { name: 'Brand identity' });
  await expect(offer).toBeVisible();
  await offer.click();

  const sheet = page.getByRole('dialog', { name: 'Brand identity' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Marks and type.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Message', exact: true }).click();

  const message = page.getByRole('dialog', { name: /^Message / });
  await expect(message).toBeVisible();
  await expect(message.locator('.gesture-sheet-verb')).toHaveText('Message');
  await expect(message.locator('.gesture-sheet-person')).toHaveCount(0);
  await expect(message.locator('.scarce-buy-party-handle')).toHaveText(
    `@${ACCOUNT}`
  );
});
