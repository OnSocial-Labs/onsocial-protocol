import { expect, test, type Page } from '@playwright/test';
import { ENDORSE_E2E_ACCOUNT } from './helpers/endorse-compose-voice';
import {
  dismissNextDevOverlay,
  gotoApp,
  softOpenPortfolioOverlay,
  waitForPortfolioClientReady,
} from './helpers/navigation';

function svgAvatar(color: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="32" fill="${color}"/></svg>`
  )}`;
}

const SEARCHED_ORBIT = {
  accountId: ENDORSE_E2E_ACCOUNT,
  viewerAccountId: null,
  counts: { incoming: 2, outgoing: 2, mutual: 1 },
  accounts: [
    {
      accountId: 'bob.testnet',
      name: 'Bob',
      avatarUrl: svgAvatar('#4f7cff'),
      kind: 'mutual',
    },
    {
      accountId: 'carol.testnet',
      name: 'Carol',
      avatarUrl: svgAvatar('#34d399'),
      kind: 'incoming',
    },
    {
      accountId: 'dave.testnet',
      name: 'Dave',
      avatarUrl: svgAvatar('#f472b6'),
      kind: 'outgoing',
    },
  ],
  search: { query: 'bo', matchTotal: 5, filter: 'all' },
};

/** Client search fetches hit the app API — stub it; initial paint is server-loaded. */
async function stubNetworkOrbitSearch(page: Page): Promise<void> {
  await page.route('**/api/profile/network**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SEARCHED_ORBIT),
    });
  });
}

/** Orbit controls are SSR'd — wait for provider hydration before typing. */
async function waitForNetworkOrbitReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.body.dataset.networkOrbitReady === 'true',
    undefined,
    { timeout: 15_000 }
  );
}

async function openStandingSheet(page: Page): Promise<void> {
  const standingHref = `/@${ENDORSE_E2E_ACCOUNT}/standing/incoming`;
  const faceLink = page.locator(`a[href="${standingHref}"]`).first();
  if (await faceLink.isVisible().catch(() => false)) {
    await faceLink.click();
    return;
  }
  // Dormant faces hide the signals row — soft-open via the hydrated App Router.
  await softOpenPortfolioOverlay(page, standingHref);
}

test.describe('network orbit', () => {
  test('hard load renders the full-page orbit chrome', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, `/@${ENDORSE_E2E_ACCOUNT}/network`);
    await dismissNextDevOverlay(page);

    await expect(
      page.getByRole('button', { name: 'Open network menu' })
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('textbox', { name: 'Search network' })
    ).toBeVisible();
    // Center account always renders once loaded, even with no connections.
    await expect(page.locator('.network-orbit-center')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('search maps mocked standings and nodes swap the orbit subject', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Idle drift keeps nodes perpetually "unstable" for actionability checks.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await stubNetworkOrbitSearch(page);
    await gotoApp(page, `/@${ENDORSE_E2E_ACCOUNT}/network`);
    await dismissNextDevOverlay(page);

    const search = page.getByRole('textbox', { name: 'Search network' });
    await expect(search).toBeVisible({ timeout: 15_000 });
    await waitForNetworkOrbitReady(page);
    await search.fill('bo');

    await expect(page.locator('.network-orbit-node')).toHaveCount(3, {
      timeout: 10_000,
    });
    await expect(
      page.getByRole('link', { name: "Open Bob's network" })
    ).toBeVisible();
    await expect(page.getByText('Map shows 3 of 5 matches')).toBeVisible();

    await page.getByRole('link', { name: "Open Bob's network" }).click();
    await expect(page).toHaveURL(/\/@bob\.testnet\/network/, {
      timeout: 10_000,
    });
    await expect(page.locator('.network-orbit-center')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('standing sheet opens the orbit overlay and view-all swaps back', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubNetworkOrbitSearch(page);
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

    await openStandingSheet(page);
    await expect(
      page.getByRole('button', { name: 'Close Standing' })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('link', { name: 'Open network map' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/@${ENDORSE_E2E_ACCOUNT}/network`)
    );
    await expect(
      page.getByRole('button', { name: 'Close Network' })
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('link', { name: 'Open standing list' })
    ).toBeVisible();

    const search = page.getByRole('textbox', { name: 'Search network' });
    await waitForNetworkOrbitReady(page);
    await search.fill('bo');
    await expect(page.locator('.network-orbit-node')).toHaveCount(3, {
      timeout: 10_000,
    });

    await page.getByRole('link', { name: 'View all' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/@${ENDORSE_E2E_ACCOUNT}/standing/incoming\\?q=bo`)
    );
    await expect(
      page.getByRole('button', { name: 'Close Standing' })
    ).toBeVisible({ timeout: 15_000 });
  });
});
