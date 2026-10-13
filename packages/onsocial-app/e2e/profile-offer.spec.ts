import { expect, test, type Page } from '@playwright/test';
import {
  dismissNextDevOverlay,
  gotoApp,
  waitForPortfolioClientReady,
} from './helpers/navigation';

const ACCOUNT = 'alice.testnet';

const ONE_OFFER = {
  offerId: 'o-1',
  title: 'Brand identity',
  line: 'Marks and type.',
  url: 'https://studio.example/book',
  since: 1,
};

const SECOND_OFFER = {
  offerId: 'o-2',
  title: 'Workshops',
  line: 'A day with the team.',
  url: null,
  since: 2,
};

async function stubOffers(
  page: Page,
  offers: Array<typeof ONE_OFFER | typeof SECOND_OFFER>
) {
  await page.route('**/api/offers**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('accountIds')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          titles: { [ACCOUNT]: offers[0]?.title ?? '' },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ offers }),
    });
  });
}

test('one offer sits on the meta line and opens Message', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubOffers(page, [ONE_OFFER]);

  await gotoApp(page, `/@${ACCOUNT}`);
  await waitForPortfolioClientReady(page);
  const identity = page.locator('.portfolio-identity');
  if (!(await identity.isVisible().catch(() => false))) {
    test.skip(true, `Portfolio account ${ACCOUNT} not found`);
  }
  await dismissNextDevOverlay(page);

  const offer = identity
    .locator('.portfolio-location')
    .getByRole('button', { name: 'View offers' });
  await expect(offer).toBeVisible();
  await expect(offer).toHaveText('Offers');
  await expect(page.locator('.portfolio-offer-lines')).toHaveCount(0);
  await offer.click();

  const sheet = page.getByRole('dialog', { name: 'Brand identity' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Marks and type.')).toBeVisible();
  await expect(
    sheet.getByRole('link', { name: 'studio.example' })
  ).toBeVisible();
  await sheet.getByRole('button', { name: 'Message', exact: true }).click();

  const message = page.getByRole('dialog', { name: /^Message / });
  await expect(message).toBeVisible();
  await expect(message.locator('.gesture-sheet-verb')).toHaveText('Message');
  await expect(message.locator('.gesture-sheet-person')).toHaveCount(0);
  await expect(message.locator('.scarce-buy-party-handle')).toHaveText(
    `@${ACCOUNT}`
  );
});

test('several offers open a list, then the offer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubOffers(page, [ONE_OFFER, SECOND_OFFER]);

  await gotoApp(page, `/@${ACCOUNT}`);
  await waitForPortfolioClientReady(page);
  const identity = page.locator('.portfolio-identity');
  if (!(await identity.isVisible().catch(() => false))) {
    test.skip(true, `Portfolio account ${ACCOUNT} not found`);
  }
  await dismissNextDevOverlay(page);

  const offer = identity
    .locator('.portfolio-location')
    .getByRole('button', { name: 'View 2 offers' });
  await expect(offer).toHaveText('Offers · 2');
  await offer.click();

  const list = page.getByRole('dialog', { name: 'Offers' });
  await expect(list).toBeVisible();
  await list.getByRole('button', { name: /Workshops/ }).click();

  const sheet = page.getByRole('dialog', { name: 'Workshops' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('A day with the team.')).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: 'Message', exact: true })
  ).toBeVisible();
});
