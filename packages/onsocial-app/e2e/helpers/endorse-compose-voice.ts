import { expect, test, type Page } from '@playwright/test';
import {
  dismissNextDevOverlay,
  gotoApp,
  softOpenPortfolioOverlay,
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

async function openEndorsementsOverlay(page: Page): Promise<void> {
  const endorsementsHref = `/@${ENDORSE_E2E_ACCOUNT}/endorsements`;
  const faceLink = page.locator(`a[href="${endorsementsHref}"]`).first();
  if (await faceLink.isVisible().catch(() => false)) {
    await faceLink.click();
    return;
  }

  // Dormant faces hide the signals row — soft-open via the hydrated App Router.
  await softOpenPortfolioOverlay(page, endorsementsHref);
}

/** Soft-open endorsements from the portfolio face, then open compose. */
export async function openEndorseComposeLoggedOut(page: Page): Promise<void> {
  await gotoApp(page, `/@${ENDORSE_E2E_ACCOUNT}`);
  await waitForPortfolioClientReady(page);

  const missing = page.getByRole('heading', { name: 'Account not found' });
  const identity = page.locator('.portfolio-identity');
  if (
    (await missing.isVisible().catch(() => false)) &&
    !(await identity.isVisible().catch(() => false))
  ) {
    test.skip(true, `Portfolio account ${ENDORSE_E2E_ACCOUNT} not found`);
  }
  await expect(identity).toBeVisible({ timeout: 10_000 });

  await dismissNextDevOverlay(page);
  await openEndorsementsOverlay(page);

  const panel = page.locator('.endorsements-panel');
  await panel.waitFor({ state: 'visible', timeout: 15_000 });

  await dismissNextDevOverlay(page);
  await panel.getByRole('button', { name: 'Endorse', exact: true }).click();
}
