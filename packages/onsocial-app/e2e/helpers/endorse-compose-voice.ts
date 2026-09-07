import type { Page } from '@playwright/test';
import {
  expectPortfolioIdentityOrSkip,
  gotoApp,
  waitForPortfolioClientReady,
} from './navigation';

export const ENDORSE_E2E_ACCOUNT = 'alice.testnet';

const EMPTY_ENDORSEMENTS = {
  accountId: ENDORSE_E2E_ACCOUNT,
  counts: { received: 0, given: 0 },
  received: [],
  given: [],
  receivedHasMore: false,
  givenHasMore: false,
};

/** Intercept endorsements so the panel opens without a live indexer. */
export async function stubEndorseComposeApis(page: Page): Promise<void> {
  await page.route('**/api/profile/endorsements**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(EMPTY_ENDORSEMENTS),
    });
  });
}

/** Soft-open endorsements from the portfolio face, then open compose. */
export async function openEndorseComposeLoggedOut(page: Page): Promise<void> {
  await gotoApp(page, `/@${ENDORSE_E2E_ACCOUNT}`);
  await expectPortfolioIdentityOrSkip(page, ENDORSE_E2E_ACCOUNT);
  await waitForPortfolioClientReady(page);

  const endorsementsLink = page
    .locator(`a[href="/@${ENDORSE_E2E_ACCOUNT}/endorsements"]`)
    .first();
  await endorsementsLink.click();

  const panel = page.locator('.endorsements-panel');
  await panel.waitFor({ state: 'visible', timeout: 15_000 });

  await panel.getByRole('button', { name: 'Endorse', exact: true }).click();
}
