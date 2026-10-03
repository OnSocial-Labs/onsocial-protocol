import { expect, test, type Page } from '@playwright/test';
import { seedE2eWallet } from './helpers/collection-page';
import {
  dismissNextDevOverlay,
  E2E_CHROME_TIMEOUT_MS,
  expectGlassSheetVisible,
  expectPortfolioIdentityOrSkip,
  gotoApp,
  waitForPortfolioClientReady,
} from './helpers';
import { e2ePortfolioAccountId } from './helpers/e2e-signers';

const SOCIAL = 10n ** 18n;
const SEASON_ID = 'season-one';
const JOIN_MIN_YOCTO = (100n * SOCIAL).toString();
const POOL_YOCTO = (5_000n * SOCIAL).toString();
const CLAIM_YOCTO = (250n * SOCIAL).toString();

const nowNs = () => BigInt(Date.now()) * 1_000_000n;

function liveConfig(): Record<string, unknown> {
  return {
    label: 'OnSocial Rally',
    active: true,
    starts_at_ns: (nowNs() - 3_600n * 1_000_000_000n).toString(),
    ends_at_ns: (nowNs() + 86_400n * 1_000_000_000n).toString(),
    is_live: true,
    claim_open: false,
  };
}

function claimConfig(): Record<string, unknown> {
  return {
    label: 'OnSocial Rally',
    active: true,
    starts_at_ns: (nowNs() - 86_400n * 1_000_000_000n).toString(),
    ends_at_ns: (nowNs() - 3_600n * 1_000_000_000n).toString(),
    is_live: false,
    claim_open: true,
  };
}

const STANDINGS = {
  total: 3,
  standings: [
    { rank: 1, score: 90, accountId: 'bob.testnet', displayName: 'Bob' },
    { rank: 2, score: 40, accountId: 'carol.testnet', displayName: null },
    { rank: 3, score: 12, accountId: 'dave.testnet', displayName: null },
  ],
};

async function stubRallyApi(
  page: Page,
  account: string,
  variant: 'join' | 'collect'
): Promise<void> {
  const live = variant === 'join';
  const entry = {
    seasonId: SEASON_ID,
    label: 'OnSocial Rally',
    phase: live ? 'live' : 'claim',
    is_live: live,
    claim_open: !live,
  };

  await page.route('**/api/near/rpc', async (route) => {
    const body = route.request().postDataJSON() as {
      params?: { request_type?: string; method_name?: string };
    };
    if (
      body.params?.request_type === 'call_function' &&
      body.params?.method_name === 'get_action_config'
    ) {
      const bytes = Array.from(
        Buffer.from(JSON.stringify({ min_amount: JOIN_MIN_YOCTO }), 'utf8')
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'onsocial-bff',
          result: { result: bytes },
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/token/balance**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ balanceYocto: (1_000n * SOCIAL).toString() }),
    });
  });

  await page.route('**/api/seasons/registry', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        live: live ? entry : null,
        upcoming: null,
        claim: live ? null : entry,
        seasons: [entry],
        resolvedActiveSeasonId: SEASON_ID,
      }),
    });
  });

  await page.route(`**/api/seasons/${SEASON_ID}/status`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        onChainConfig: live ? liveConfig() : claimConfig(),
        settlement: live
          ? null
          : { status: 'published', publishedTxHash: 'tx-hash' },
        joinMinYocto: JOIN_MIN_YOCTO,
        indexedPoolYocto: POOL_YOCTO,
      }),
    });
  });

  await page.route(`**/api/seasons/${SEASON_ID}/standings**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(STANDINGS),
    });
  });

  await page.route(`**/api/seasons/${SEASON_ID}/me**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        standing: live
          ? null
          : { rank: 2, score: 40, accountId: account, displayName: null },
      }),
    });
  });

  await page.route(`**/api/seasons/${SEASON_ID}/claims/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        claim: live
          ? null
          : {
              seasonId: SEASON_ID,
              accountId: account,
              amountYocto: CLAIM_YOCTO,
              proof: [],
              rank: 2,
              score: 40,
              claimed: false,
            },
      }),
    });
  });
}

const PAST_CLAIM_SEASON_ID = 'season-two';
const PAST_ARCHIVED_SEASON_ID = 'season-zero';

function pastSeasonEntry(
  seasonId: string,
  label: string,
  phase: 'claim' | 'archived',
  claimOpen: boolean
): Record<string, unknown> {
  const startMs = Date.now() - 21 * 86_400_000;
  const endMs = Date.now() - 14 * 86_400_000;
  return {
    seasonId,
    label,
    phase,
    is_live: false,
    claim_open: claimOpen,
    starts_at_ns: (BigInt(startMs) * 1_000_000n).toString(),
    ends_at_ns: (BigInt(endMs) * 1_000_000n).toString(),
  };
}

/** Live current rally + two past seasons (one still collectable, one done). */
async function stubRallyApiWithPast(
  page: Page,
  account: string
): Promise<void> {
  const liveEntry = {
    seasonId: SEASON_ID,
    label: 'OnSocial Rally',
    phase: 'live',
    is_live: true,
    claim_open: false,
  };

  await page.route('**/api/near/rpc', async (route) => {
    const body = route.request().postDataJSON() as {
      params?: { request_type?: string; method_name?: string };
    };
    if (
      body.params?.request_type === 'call_function' &&
      body.params?.method_name === 'get_action_config'
    ) {
      const bytes = Array.from(
        Buffer.from(JSON.stringify({ min_amount: JOIN_MIN_YOCTO }), 'utf8')
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'onsocial-bff',
          result: { result: bytes },
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/token/balance**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ balanceYocto: (1_000n * SOCIAL).toString() }),
    });
  });

  await page.route('**/api/seasons/registry', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        live: liveEntry,
        upcoming: null,
        claim: null,
        seasons: [
          liveEntry,
          pastSeasonEntry(
            PAST_CLAIM_SEASON_ID,
            'Season Two Rally',
            'claim',
            true
          ),
          pastSeasonEntry(
            PAST_ARCHIVED_SEASON_ID,
            'Genesis Rally',
            'archived',
            false
          ),
        ],
        resolvedActiveSeasonId: SEASON_ID,
      }),
    });
  });

  await page.route(/\/api\/seasons\/([^/]+)\/status$/, async (route) => {
    const seasonId = new URL(route.request().url()).pathname.split('/')[3];
    const pastClaim = seasonId === PAST_CLAIM_SEASON_ID;
    const config =
      seasonId === SEASON_ID
        ? liveConfig()
        : {
            label:
              seasonId === PAST_CLAIM_SEASON_ID
                ? 'Season Two Rally'
                : 'Genesis Rally',
            active: pastClaim,
            starts_at_ns: (
              BigInt(Date.now() - 21 * 86_400_000) * 1_000_000n
            ).toString(),
            ends_at_ns: (
              BigInt(Date.now() - 14 * 86_400_000) * 1_000_000n
            ).toString(),
            is_live: false,
            claim_open: pastClaim,
          };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        onChainConfig: config,
        settlement:
          seasonId === SEASON_ID
            ? null
            : { status: 'published', publishedTxHash: 'tx-hash' },
        joinMinYocto: JOIN_MIN_YOCTO,
        indexedPoolYocto: POOL_YOCTO,
      }),
    });
  });

  await page.route(/\/api\/seasons\/([^/]+)\/standings/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(STANDINGS),
    });
  });

  await page.route(/\/api\/seasons\/([^/]+)\/me/, async (route) => {
    const seasonId = new URL(route.request().url()).pathname.split('/')[3];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        standing:
          seasonId === SEASON_ID
            ? null
            : {
                rank: seasonId === PAST_CLAIM_SEASON_ID ? 2 : 5,
                score: 40,
                accountId: account,
                displayName: null,
              },
      }),
    });
  });

  await page.route(/\/api\/seasons\/([^/]+)\/claims\//, async (route) => {
    const seasonId = new URL(route.request().url()).pathname.split('/')[3];
    const claim =
      seasonId === PAST_CLAIM_SEASON_ID
        ? {
            seasonId,
            accountId: account,
            amountYocto: CLAIM_YOCTO,
            proof: [],
            rank: 2,
            score: 40,
            claimed: false,
          }
        : seasonId === PAST_ARCHIVED_SEASON_ID
          ? {
              seasonId,
              accountId: account,
              amountYocto: (100n * SOCIAL).toString(),
              proof: [],
              rank: 5,
              score: 12,
              claimed: true,
            }
          : null;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ claim }),
    });
  });
}

test.describe('rally sheet', () => {
  test('live season opens with join affordance and standings', async ({
    page,
  }) => {
    const account = e2ePortfolioAccountId();
    await seedE2eWallet(page, account);
    await stubRallyApi(page, account, 'join');
    await gotoApp(page, `/@${account}?sheet=rally`);
    await waitForPortfolioClientReady(page);
    await expectPortfolioIdentityOrSkip(page, account);
    await dismissNextDevOverlay(page);

    await expectGlassSheetVisible(page, { timeout: E2E_CHROME_TIMEOUT_MS });
    const sheet = page.getByRole('dialog').filter({ hasText: 'Rally' });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByRole('heading', { name: /Join OnSocial Rally/i })
    ).toBeVisible();
    await expect(sheet.getByText('5,000 SOCIAL · 3 in')).toBeVisible();
    await expect(sheet.getByRole('list', { name: 'Standings' })).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: 'Join · 100 SOCIAL' })
    ).toBeVisible();
    await sheet.screenshot({ path: 'test-results/rally-sheet-join.png' });
  });

  test('claim window opens with the collectable amount', async ({ page }) => {
    const account = e2ePortfolioAccountId();
    await seedE2eWallet(page, account);
    await stubRallyApi(page, account, 'collect');
    await gotoApp(page, `/@${account}?sheet=rally`);
    await waitForPortfolioClientReady(page);
    await expectPortfolioIdentityOrSkip(page, account);
    await dismissNextDevOverlay(page);

    await expectGlassSheetVisible(page, { timeout: E2E_CHROME_TIMEOUT_MS });
    const sheet = page.getByRole('dialog').filter({ hasText: 'Rally' });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByRole('heading', { name: /ready to collect/i })
    ).toBeVisible();
    await expect(sheet.getByText('Ready to collect.')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Collect' })).toBeVisible();
    await sheet.screenshot({ path: 'test-results/rally-sheet-collect.png' });
  });

  test('past rallies drawer lists outcomes and opens a past rally', async ({
    page,
  }) => {
    const account = e2ePortfolioAccountId();
    await seedE2eWallet(page, account);
    await stubRallyApiWithPast(page, account);
    await gotoApp(page, `/@${account}?sheet=rally`);
    await waitForPortfolioClientReady(page);
    await expectPortfolioIdentityOrSkip(page, account);
    await dismissNextDevOverlay(page);

    await expectGlassSheetVisible(page, { timeout: E2E_CHROME_TIMEOUT_MS });
    const sheet = page.getByRole('dialog').filter({
      has: page.getByRole('button', { name: 'Close rally' }),
    });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByRole('heading', { name: /Join OnSocial Rally/i })
    ).toBeVisible();

    const pastEntry = sheet.getByRole('button', { name: 'Past rallies' });
    await expect(pastEntry).toBeVisible();
    // season-two still owes the viewer 250 SOCIAL — the dot says so.
    await expect(sheet.locator('.rally-past-entry-dot')).toBeVisible();
    await pastEntry.click();

    const drawer = page.getByRole('dialog').filter({
      has: page.getByRole('button', { name: 'Close past rallies' }),
    });
    await expect(drawer).toBeVisible();
    await expect(
      drawer.getByRole('button', { name: /Season Two Rally/ })
    ).toBeVisible();
    await expect(drawer.getByText('Collect · 250 SOCIAL')).toBeVisible();
    await expect(
      drawer.getByRole('button', { name: /Genesis Rally/ })
    ).toBeVisible();
    await expect(drawer.getByText('Collected')).toBeVisible();
    await drawer.screenshot({ path: 'test-results/rally-past-drawer.png' });

    await drawer.getByRole('button', { name: /Season Two Rally/ }).click();
    await expect(drawer).toBeHidden();
    await expect(
      sheet.getByRole('heading', { name: /ready to collect/i })
    ).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Collect' })).toBeVisible();

    await sheet.getByRole('button', { name: 'Back to past rallies' }).click();
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: 'Close past rallies' }).click();
    await expect(
      sheet.getByRole('heading', { name: /Join OnSocial Rally/i })
    ).toBeVisible();
  });

  test('deep link opens a past rally read-only', async ({ page }) => {
    const account = e2ePortfolioAccountId();
    await seedE2eWallet(page, account);
    await stubRallyApiWithPast(page, account);
    await gotoApp(
      page,
      `/@${account}?sheet=rally&season=${PAST_ARCHIVED_SEASON_ID}`
    );
    await waitForPortfolioClientReady(page);
    await expectPortfolioIdentityOrSkip(page, account);
    await dismissNextDevOverlay(page);

    await expectGlassSheetVisible(page, { timeout: E2E_CHROME_TIMEOUT_MS });
    const sheet = page.getByRole('dialog').filter({
      has: page.getByRole('button', { name: 'Close rally' }),
    });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByRole('heading', { name: 'Genesis Rally collected' })
    ).toBeVisible();
    await expect(sheet.getByText('SOCIAL collected.')).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: 'Back to past rallies' })
    ).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Collect' })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: /Join/ })).toHaveCount(0);
    await sheet.screenshot({ path: 'test-results/rally-sheet-past.png' });
  });
});
