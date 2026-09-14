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

function yocto(amount: bigint): string {
  return (amount * SOCIAL).toString();
}

async function stubBoostSheetReads(page: Page): Promise<void> {
  const locked = yocto(100n);
  const influence = yocto(120n);
  const networkInfluence = yocto(12_000n);
  const unlockAtNs =
    (BigInt(Date.now()) + 365n * 24n * 60n * 60n * 1000n) * 1_000_000n;

  await page.route('**/api/onapi/data/boost-account**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        locked_amount: locked,
        unlock_at: Number(unlockAtNs),
        lock_months: 12,
        effective_boost: influence,
        claimable_rewards: yocto(5n),
        boost_seconds: '0',
        rewards_claimed: yocto(12n),
      }),
    });
  });
  await page.route('**/api/onapi/data/boost-lock-status**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        is_locked: true,
        locked_amount: locked,
        lock_months: 12,
        unlock_at: Number(unlockAtNs),
        can_unlock: false,
        time_remaining_ns: Number(unlockAtNs),
        bonus_percent: 20,
        effective_boost: influence,
        lock_expired: false,
      }),
    });
  });
  await page.route('**/api/onapi/data/boost-rewards-live**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        claimable_rewards: yocto(5n),
        rewards_per_second: '0',
        as_of_timestamp_ns: Number(BigInt(Date.now()) * 1_000_000n),
        effective_boost: influence,
        total_effective_boost: networkInfluence,
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
        total_locked: yocto(50_000n),
        total_effective_boost: networkInfluence,
        total_boost_seconds: '0',
        total_rewards_released: yocto(1_000n),
        scheduled_pool: yocto(8_000n),
        infra_pool: '0',
        last_release_time: 0,
        active_weekly_rate_bps: 125,
        release_schedule_start_ns: 0,
        initial_weekly_rate_bps: 125,
        rate_step_bps: 0,
        rate_step_interval_months: 0,
        max_weekly_rate_bps: 125,
      }),
    });
  });
  await page.route('**/api/boost-network**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ boosterCount: 42 }),
    });
  });
}

test.describe('boost sheet network pulse', () => {
  test('shows share and network locked / pool / rate', async ({ page }) => {
    const account = e2ePortfolioAccountId();
    await seedE2eWallet(page, account);
    await stubBoostSheetReads(page);
    await gotoApp(page, `/@${account}?sheet=boost`);
    await waitForPortfolioClientReady(page);
    await expectPortfolioIdentityOrSkip(page, account);
    await dismissNextDevOverlay(page);

    await expectGlassSheetVisible(page, { timeout: E2E_CHROME_TIMEOUT_MS });
    const sheet = page.getByRole('dialog').filter({ hasText: 'Boost' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Share', { exact: true })).toBeVisible();
    await expect(sheet.getByText('1.00%')).toBeVisible();

    const network = sheet.getByRole('region', { name: 'Network' });
    await expect(network.getByText('Boosters')).toBeVisible();
    await expect(network.getByText('42')).toBeVisible();
    await expect(network.getByText('Locked')).toBeVisible();
    await expect(network.getByText('50.0K')).toBeVisible();
    await expect(network.getByText('Pool')).toBeVisible();
    await expect(network.getByText('8,000')).toBeVisible();
    await expect(network.getByText('Rate')).toBeVisible();
    await expect(network.getByText('1.25%')).toBeVisible();
  });
});
