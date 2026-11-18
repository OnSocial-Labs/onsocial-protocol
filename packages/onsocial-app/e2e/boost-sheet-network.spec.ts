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
    await expect(sheet.getByText('1.00%', { exact: true })).toBeVisible();

    const network = sheet.getByRole('region', { name: 'Network' });
    await expect(network.getByText('Boosters')).toBeVisible();
    await expect(network.getByText('42')).toBeVisible();
    await expect(network.getByText('Locked')).toBeVisible();
    await expect(network.getByText('50.0K')).toBeVisible();
    await expect(network.getByText('Pool')).toBeVisible();
    await expect(network.getByText('8,000')).toBeVisible();
    await expect(network.getByText('Rate')).toBeVisible();
    await expect(network.getByText('1.25%')).toBeVisible();
    await sheet.screenshot({
      path: 'test-results/boost-sheet-network-pulse.png',
    });
  });
});

type BoostStubMode = 'lock' | 'empty' | 'fail';

function boostStubState() {
  return {
    position: 'lock' as BoostStubMode,
    stats: 'ok' as 'ok' | 'fail' | 'zero',
  };
}

async function installMutableBoostRoutes(
  page: Page,
  state: ReturnType<typeof boostStubState>
) {
  const locked = yocto(263n);
  const influence = yocto(315n);
  const unlockAtNs =
    (BigInt(Date.now()) + 365n * 24n * 60n * 60n * 1000n) * 1_000_000n;
  const amount = () => (state.position === 'empty' ? '0' : locked);

  const fulfill = (
    route: Parameters<Parameters<Page['route']>[1]>[0],
    status: number,
    body: unknown
  ) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

  await page.route('**/api/onapi/data/boost-account**', async (route) => {
    if (state.position === 'fail') {
      await fulfill(route, 502, { error: 'rate limit' });
      return;
    }
    const lockedAmount = amount();
    await fulfill(route, 200, {
      locked_amount: lockedAmount,
      unlock_at: lockedAmount === '0' ? 0 : Number(unlockAtNs),
      lock_months: lockedAmount === '0' ? 0 : 12,
      effective_boost: lockedAmount === '0' ? '0' : influence,
      claimable_rewards: '0',
      boost_seconds: '0',
      rewards_claimed: '0',
    });
  });
  await page.route('**/api/onapi/data/boost-lock-status**', async (route) => {
    if (state.position === 'fail') {
      await fulfill(route, 502, { error: 'rate limit' });
      return;
    }
    const lockedAmount = amount();
    await fulfill(route, 200, {
      is_locked: lockedAmount !== '0',
      locked_amount: lockedAmount,
      lock_months: lockedAmount === '0' ? 0 : 12,
      unlock_at: lockedAmount === '0' ? 0 : Number(unlockAtNs),
      can_unlock: false,
      time_remaining_ns: 0,
      bonus_percent: lockedAmount === '0' ? 0 : 20,
      effective_boost: lockedAmount === '0' ? '0' : influence,
      lock_expired: false,
    });
  });
  await page.route('**/api/onapi/data/boost-rewards-live**', async (route) => {
    if (state.position === 'fail') {
      await fulfill(route, 502, { error: 'rate limit' });
      return;
    }
    await fulfill(route, 200, {
      claimable_rewards: '0',
      rewards_per_second: '0',
      as_of_timestamp_ns: Number(BigInt(Date.now()) * 1_000_000n),
      effective_boost: amount() === '0' ? '0' : influence,
      total_effective_boost: yocto(12_000n),
    });
  });
  await page.route('**/api/onapi/data/boost-stats**', async (route) => {
    if (state.stats === 'fail') {
      await fulfill(route, 502, { error: 'rate limit' });
      return;
    }
    const zero = state.stats === 'zero' || state.position === 'empty';
    await fulfill(route, 200, {
      version: '0.1.0',
      token_id: 'token.onsocial.testnet',
      owner_id: 'onsocial.testnet',
      total_locked: zero ? '0' : yocto(50_000n),
      total_effective_boost: zero ? '0' : yocto(12_000n),
      total_boost_seconds: '0',
      total_rewards_released: '0',
      scheduled_pool: zero ? '0' : yocto(8_000n),
      infra_pool: '0',
      last_release_time: 0,
      active_weekly_rate_bps: zero ? 0 : 125,
      release_schedule_start_ns: 0,
      initial_weekly_rate_bps: 125,
      rate_step_bps: 0,
      rate_step_interval_months: 0,
      max_weekly_rate_bps: 125,
    });
  });
  await page.route('**/api/boost-network**', async (route) => {
    await fulfill(route, 200, { boosterCount: 42 });
  });
}

async function refreshOpenBoost(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen = new Set<object>();
    const fns: Array<() => void> = [];
    const nodes = [
      document.documentElement,
      document.body,
      ...document.querySelectorAll('[role="dialog"]'),
    ];
    const fiberOf = (el: Element) => {
      for (const key of Object.keys(el)) {
        if (
          key.startsWith('__reactFiber$') ||
          key.startsWith('__reactContainer$')
        ) {
          return (el as unknown as Record<string, { current?: object }>)[key];
        }
      }
      return null;
    };
    const walk = (
      fiber: {
        memoizedState?: unknown;
        child?: object;
        sibling?: object;
        return?: object;
      } | null,
      depth: number
    ) => {
      if (!fiber || seen.has(fiber) || depth > 400) return;
      seen.add(fiber);
      let hook = fiber.memoizedState as {
        memoizedState?: unknown;
        next?: { memoizedState?: unknown; next?: unknown };
      } | null;
      let guard = 0;
      while (hook && guard < 100) {
        const memo = hook.memoizedState;
        const candidates = [
          ...(typeof memo === 'function' ? [memo] : []),
          ...(Array.isArray(memo)
            ? memo.filter((item) => typeof item === 'function')
            : []),
        ];
        for (const candidate of candidates) {
          const src = Function.prototype.toString.call(candidate);
          if (
            src.includes('fetchBoostAccount') ||
            src.includes('discardLastGood')
          ) {
            fns.push(candidate as () => void);
          }
        }
        hook = (hook.next ?? null) as typeof hook;
        guard += 1;
      }
      walk((fiber.child as typeof fiber) ?? null, depth + 1);
      walk((fiber.sibling as typeof fiber) ?? null, depth + 1);
      walk((fiber.return as typeof fiber) ?? null, depth + 1);
    };
    for (const node of nodes) {
      const fiber = fiberOf(node);
      const start =
        fiber && typeof fiber === 'object' && 'current' in fiber
          ? fiber.current
          : fiber;
      walk(start as never, 0);
    }
    const unique = new Set(fns);
    for (const fn of unique) fn();
  });
}

test.describe('boost read failures', () => {
  test('first-load failure offers retry and recovers without Commit', async ({
    page,
  }) => {
    const account = e2ePortfolioAccountId();
    const state = boostStubState();
    state.position = 'fail';
    await seedE2eWallet(page, account);
    await installMutableBoostRoutes(page, state);
    await gotoApp(page, `/@${account}?sheet=boost`);
    await waitForPortfolioClientReady(page);
    await expectPortfolioIdentityOrSkip(page, account);
    await dismissNextDevOverlay(page);

    const sheet = page.getByRole('dialog').filter({ hasText: 'Boost' });
    await expect(sheet).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(
      sheet.getByRole('heading', { name: 'Boost unavailable' })
    ).toBeVisible();
    const alert = sheet.getByRole('alert');
    await expect(alert).toHaveText(/Couldn.t load your lock/);
    await expect(sheet.getByRole('button', { name: 'Commit' })).toHaveCount(0);
    await expect(
      sheet.getByRole('button', { name: 'Try again' })
    ).toBeVisible();

    state.position = 'empty';
    state.stats = 'zero';
    await sheet.getByRole('button', { name: 'Try again' }).click();
    await expect(
      sheet.getByRole('heading', { name: 'Lock SOCIAL' })
    ).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Commit' })).toBeVisible();
  });

  test('a failed refresh keeps the lock', async ({ page }) => {
    const account = e2ePortfolioAccountId();
    const state = boostStubState();
    await seedE2eWallet(page, account);
    await installMutableBoostRoutes(page, state);
    await gotoApp(page, `/@${account}?sheet=boost`);
    await waitForPortfolioClientReady(page);
    await expectPortfolioIdentityOrSkip(page, account);
    await dismissNextDevOverlay(page);

    const sheet = page.getByRole('dialog').filter({ hasText: 'Boost' });
    await expect(sheet.getByText('SOCIAL locked')).toBeVisible({
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    state.position = 'fail';
    await refreshOpenBoost(page);
    await expect(sheet.getByText('263.00')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Commit' })).toHaveCount(0);
    await expect(
      sheet.getByRole('heading', { name: 'Boost unavailable' })
    ).toHaveCount(0);
  });

  test('a real empty lock still offers Commit', async ({ page }) => {
    const account = e2ePortfolioAccountId();
    const state = boostStubState();
    state.position = 'empty';
    state.stats = 'zero';
    await seedE2eWallet(page, account);
    await installMutableBoostRoutes(page, state);
    await gotoApp(page, `/@${account}?sheet=boost`);
    await waitForPortfolioClientReady(page);
    await expectPortfolioIdentityOrSkip(page, account);
    await dismissNextDevOverlay(page);

    const sheet = page.getByRole('dialog').filter({ hasText: 'Boost' });
    await expect(
      sheet.getByRole('heading', { name: 'Lock SOCIAL' })
    ).toBeVisible({
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await expect(sheet.getByRole('button', { name: 'Commit' })).toBeVisible();
  });

  test('a stats failure keeps Boosters and drops the dashes', async ({
    page,
  }) => {
    const account = e2ePortfolioAccountId();
    const state = boostStubState();
    state.stats = 'fail';
    await seedE2eWallet(page, account);
    await installMutableBoostRoutes(page, state);
    await gotoApp(page, `/@${account}?sheet=boost`);
    await waitForPortfolioClientReady(page);
    await expectPortfolioIdentityOrSkip(page, account);
    await dismissNextDevOverlay(page);

    const sheet = page.getByRole('dialog').filter({ hasText: 'Boost' });
    const network = sheet.getByRole('region', { name: 'Network' });
    await expect(network.getByText('42')).toBeVisible({
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await expect(network.getByRole('alert')).toHaveText(
      /Couldn.t load network stats/
    );
    await expect(network.getByText('—')).toHaveCount(0);
    await expect(network.getByText('Locked')).toHaveCount(0);
  });
});
