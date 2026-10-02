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
    await expect(
      sheet.getByRole('list', { name: 'Standings' })
    ).toBeVisible();
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
    await expect(
      sheet.getByRole('button', { name: 'Collect' })
    ).toBeVisible();
    await sheet.screenshot({ path: 'test-results/rally-sheet-collect.png' });
  });
});
