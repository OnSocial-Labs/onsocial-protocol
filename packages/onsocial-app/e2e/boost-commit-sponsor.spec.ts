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
import {
  expectE2eSignerWrite,
  seedE2eMockSigner,
} from './helpers/e2e-mock-signer';

const SOCIAL = 10n ** 18n;

async function stubEmptyBoost(page: Page): Promise<void> {
  const emptyAccount = {
    locked_amount: '0',
    unlock_at: 0,
    lock_months: 0,
    effective_boost: '0',
    claimable_rewards: '0',
    boost_seconds: '0',
    rewards_claimed: '0',
  };
  await page.route('**/api/onapi/data/boost-account**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(emptyAccount),
    });
  });
  await page.route('**/api/onapi/data/boost-lock-status**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        is_locked: false,
        locked_amount: '0',
        lock_months: 0,
        unlock_at: 0,
        can_unlock: false,
        time_remaining_ns: 0,
        bonus_percent: 0,
        effective_boost: '0',
        lock_expired: false,
      }),
    });
  });
  await page.route('**/api/onapi/data/boost-rewards-live**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        claimable_rewards: '0',
        rewards_per_second: '0',
        as_of_timestamp_ns: 0,
        effective_boost: '0',
        total_effective_boost: '0',
      }),
    });
  });
  await page.route('**/api/onapi/data/boost-stats**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: '0.1.0',
        token_id: 'token.onsocial.testnet',
        owner_id: 'onsocial.testnet',
        total_locked: '0',
        total_effective_boost: '0',
        total_boost_seconds: '0',
        total_rewards_released: '0',
        scheduled_pool: '0',
        infra_pool: '0',
        last_release_time: 0,
        active_weekly_rate_bps: 0,
        release_schedule_start_ns: 0,
        initial_weekly_rate_bps: 0,
        rate_step_bps: 0,
        rate_step_interval_months: 0,
        max_weekly_rate_bps: 0,
      }),
    });
  });
  await page.route('**/api/boost-network**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ boosterCount: 0 }),
    });
  });
  await page.route('**/api/token/balance**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ balanceYocto: (10n * SOCIAL).toString() }),
    });
  });
}

test.describe('boost commit fallback', () => {
  test('records a token transfer to boost when sponsorship is not available', async ({
    page,
  }) => {
    const account = e2ePortfolioAccountId();
    let relayHits = 0;
    await page.route('**/api/onapi/relay/delegate**', async (route) => {
      relayHits += 1;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'relay should not be called' }),
      });
    });
    await seedE2eMockSigner(page, account);
    await seedE2eWallet(page, account);
    await stubEmptyBoost(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, `/@${account}?sheet=boost`);
    await waitForPortfolioClientReady(page);
    await expectPortfolioIdentityOrSkip(page, account);
    await dismissNextDevOverlay(page);
    await expectGlassSheetVisible(page, { timeout: E2E_CHROME_TIMEOUT_MS });

    const sheet = page.getByRole('dialog').filter({ hasText: 'Boost' });
    await sheet.getByRole('textbox', { name: 'Amount in SOCIAL' }).fill('1');
    await sheet.getByRole('button', { name: 'Commit', exact: true }).click();

    await expectE2eSignerWrite(page, (recorded) => {
      const transfer = recorded.find(
        (call) => call.methodName === 'ft_transfer_call'
      );
      expect(transfer).toBeTruthy();
      expect(transfer?.receiverId).toBe('token.onsocial.testnet');
      const args = transfer?.args as {
        receiver_id?: string;
        amount?: string;
        msg?: string;
      };
      expect(args.receiver_id).toBe('boost.onsocial.testnet');
      expect(args.amount).toBe(SOCIAL.toString());
      expect(args.msg).toContain('"action":"lock"');
    });
    expect(relayHits).toBe(0);
  });
});
