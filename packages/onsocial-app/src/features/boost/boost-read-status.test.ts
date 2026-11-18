// @vitest-environment jsdom
import { createElement, useEffect, type MutableRefObject } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoostNetworkPulse } from '@/features/boost/boost-network-pulse';
import { PortfolioBoostSheet } from '@/features/boost/portfolio-boost-sheet';
import {
  useBoostPosition,
  type BoostPositionRefreshOptions,
} from '@/features/boost/use-boost-position';
import { useBoostNetworkPulse } from '@/features/boost/use-boost-network';
import { DaoBoostSheet } from '@/features/protocol/dao-boost-sheet';
import { LeaderboardSheet } from '@/features/leaderboard/leaderboard-sheet';
import { PortfolioOwnerPayoutMarks } from '@/components/portfolio/portfolio-owner-payout-marks';

vi.mock('@/contexts/app-wallet-context', () => ({
  useAppWallet: () => ({
    accountId: 'alice.testnet',
    isConnected: true,
    isLoading: false,
    connect: async () => {},
    getSigningWallet: async () => ({
      accountId: 'alice.testnet',
      wallet: {
        signAndSendTransaction: async () => ({
          transaction: { hash: 'a'.repeat(44) },
        }),
      },
    }),
  }),
}));

vi.mock('@/contexts/app-transaction-feedback-context', () => ({
  useAppTransactionFeedback: () => ({
    setTxResult: () => {},
    clearTxResult: () => {},
    trackTransaction: async () => true,
  }),
}));

vi.mock('@/hooks/use-app-onsocial-client', () => ({
  useAppOnSocialClient: () => ({
    getClient: async () => ({
      accountId: 'alice.testnet',
      client: {},
      session: null,
      wallet: {
        signAndSendTransaction: async () => ({
          transaction: { hash: 'a'.repeat(44) },
        }),
      },
    }),
  }),
}));

vi.mock('@/features/boost/boost-sheet-host', () => ({
  useBoostSheet: () => ({
    open: false,
    openBoostSheet: () => {},
    closeBoostSheet: () => {},
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    refresh: () => {},
    back: () => {},
  }),
  usePathname: () => '/@alice.testnet',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children }: { children?: unknown }) => children,
}));

vi.mock('@/features/rally/rally-sheet-host', () => ({
  useRallySheet: () => ({
    occasion: { loaded: true },
    mark: { visible: false, loaded: true },
    openRallySheet: () => {},
  }),
}));

const SOCIAL = 10n ** 18n;

function yocto(whole: bigint): string {
  return (whole * SOCIAL).toString();
}

function accountBody(amount: string, unlockAt = 0) {
  const empty = amount === '0';
  return {
    locked_amount: amount,
    unlock_at: unlockAt,
    lock_months: empty ? 0 : 12,
    effective_boost: empty ? '0' : yocto(300n),
    claimable_rewards: '0',
    boost_seconds: '0',
    rewards_claimed: '0',
  };
}

function lockBody(
  amount: string,
  unlockAt = 0,
  flags: { can_unlock?: boolean; lock_expired?: boolean } = {}
) {
  const empty = amount === '0';
  return {
    is_locked: !empty,
    locked_amount: amount,
    lock_months: empty ? 0 : 12,
    unlock_at: unlockAt,
    can_unlock: flags.can_unlock ?? false,
    time_remaining_ns: 0,
    bonus_percent: empty ? 0 : 20,
    effective_boost: empty ? '0' : yocto(300n),
    lock_expired: flags.lock_expired ?? false,
  };
}

function snapshotBody() {
  return {
    claimable_rewards: '0',
    rewards_per_second: '0',
    as_of_timestamp_ns: 1_700_000_000_000_000,
    effective_boost: '0',
    total_effective_boost: yocto(10_000n),
  };
}

function statsBody(total = yocto(50_000n)) {
  return {
    version: '0.1.0',
    token_id: 'token.onsocial.testnet',
    owner_id: 'onsocial.testnet',
    total_locked: total,
    total_effective_boost: total,
    total_boost_seconds: '0',
    total_rewards_released: '0',
    scheduled_pool: total,
    infra_pool: '0',
    last_release_time: 0,
    active_weekly_rate_bps: total === '0' ? 0 : 125,
    release_schedule_start_ns: 0,
    initial_weekly_rate_bps: 125,
    rate_step_bps: 0,
    rate_step_interval_months: 0,
    max_weekly_rate_bps: 125,
  };
}

type PositionMode =
  | { kind: 'lock'; unlockAt?: number; canUnlock?: boolean; expired?: boolean }
  | { kind: 'empty' }
  | { kind: 'fail' }
  | { kind: 'empty-object' }
  | { kind: 'missing-locked' }
  | { kind: 'hang' };

let positionMode: PositionMode = { kind: 'lock' };
let statsMode: 'ok' | 'fail' | 'zero' = 'ok';
let fetchCalls: string[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installFetch() {
  fetchCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url.includes('/api/token/balance')) {
        return jsonResponse({ balanceYocto: yocto(1_500_000n) });
      }
      if (url.includes('/api/boost-network')) {
        return jsonResponse({ boosterCount: 42 });
      }
      if (url.includes('boost-stats')) {
        if (statsMode === 'fail')
          return jsonResponse({ error: 'rate limit' }, 502);
        if (statsMode === 'zero') return jsonResponse(statsBody('0'));
        return jsonResponse(statsBody());
      }
      const boostRead =
        url.includes('boost-account') ||
        url.includes('boost-lock-status') ||
        url.includes('boost-rewards-live');
      if (boostRead) {
        if (positionMode.kind === 'hang') {
          return new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) return;
            if (signal.aborted) {
              reject(signal.reason);
              return;
            }
            signal.addEventListener('abort', () => {
              reject(signal.reason ?? new Error('aborted'));
            });
          });
        }
        if (positionMode.kind === 'fail') {
          return jsonResponse({ error: 'rate limit' }, 502);
        }
        if (positionMode.kind === 'empty-object') return jsonResponse({});
        if (positionMode.kind === 'missing-locked') {
          return jsonResponse({ unlock_at: 0, lock_months: 0 });
        }
        const amount = positionMode.kind === 'empty' ? '0' : yocto(263n);
        const unlockAt =
          positionMode.kind === 'lock' ? (positionMode.unlockAt ?? 0) : 0;
        if (url.includes('boost-lock-status')) {
          return jsonResponse(
            lockBody(amount, unlockAt, {
              can_unlock:
                positionMode.kind === 'lock' ? positionMode.canUnlock : false,
              lock_expired:
                positionMode.kind === 'lock' ? positionMode.expired : false,
            })
          );
        }
        if (url.includes('boost-rewards-live'))
          return jsonResponse(snapshotBody());
        return jsonResponse(accountBody(amount, unlockAt));
      }
      return jsonResponse({});
    })
  );
}

beforeEach(() => {
  positionMode = { kind: 'lock' };
  statsMode = 'ok';
  installFetch();
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
});

function SheetHarness({
  accountId,
  refreshRef,
}: {
  accountId: string;
  refreshRef?: MutableRefObject<
    ((options?: BoostPositionRefreshOptions) => Promise<void>) | null
  >;
}) {
  const position = useBoostPosition(accountId, { live: true });
  useEffect(() => {
    if (!refreshRef) return;
    refreshRef.current = position.refresh;
  }, [position.refresh, refreshRef]);
  return createElement(PortfolioBoostSheet, {
    open: true,
    accountId,
    position,
    onOpenChange: () => {},
  });
}

function NetworkHarness() {
  const network = useBoostNetworkPulse(true);
  return createElement(BoostNetworkPulse, {
    boosterCount: network.boosterCount,
    totalLockedYocto: network.stats?.total_locked ?? null,
    scheduledPoolYocto: network.stats?.scheduled_pool ?? null,
    activeWeeklyRateBps: network.stats?.active_weekly_rate_bps ?? null,
    loading: !network.loaded,
    error: network.statsError,
    onRetry: () => {
      void network.refresh();
    },
  });
}

function Pair({ accountId }: { accountId: string }) {
  useBoostPosition(accountId);
  useBoostPosition(accountId);
  return null;
}

describe('boost read status', () => {
  it('keeps the lock when a later read fails', async () => {
    const { result } = renderHook(() => useBoostPosition('alice.testnet'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.hasPosition).toBe(true);
    positionMode = { kind: 'fail' };
    await result.current.refresh();
    expect(result.current.status).toBe('ready');
    expect(result.current.hasPosition).toBe(true);
    expect(result.current.lockedYocto).toBe(263n * SOCIAL);
  });

  it('shows an error and no lock form when the first read fails', async () => {
    positionMode = { kind: 'fail' };
    render(createElement(SheetHarness, { accountId: 'alice.testnet' }));
    expect(
      await screen.findByRole('heading', { name: 'Boost unavailable' })
    ).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(
      /Couldn.t load your lock/
    );
    expect(screen.queryByRole('button', { name: 'Commit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Max' })).toBeNull();
  });

  it('shows the lock form when the contract returns a zero lock', async () => {
    positionMode = { kind: 'empty' };
    statsMode = 'zero';
    render(createElement(SheetHarness, { accountId: 'alice.testnet' }));
    expect(
      await screen.findByRole('heading', { name: 'Lock SOCIAL' })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Commit' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shares one in-flight read across two hooks on the same account', async () => {
    render(createElement(Pair, { accountId: 'shared.testnet' }));
    await waitFor(() => {
      const reads = fetchCalls.filter((url) => url.includes('boost-account'));
      expect(reads.length).toBeGreaterThan(0);
    });
    expect(
      fetchCalls.filter((url) => url.includes('boost-account'))
    ).toHaveLength(1);
    expect(
      fetchCalls.filter((url) => url.includes('boost-lock-status'))
    ).toHaveLength(1);
    expect(
      fetchCalls.filter((url) => url.includes('boost-rewards-live'))
    ).toHaveLength(1);
  });

  it('does not show account A when account B fails', async () => {
    const { rerender } = render(
      createElement(SheetHarness, { accountId: 'a.testnet' })
    );
    expect(await screen.findByText(/SOCIAL locked/)).toBeTruthy();
    positionMode = { kind: 'fail' };
    rerender(createElement(SheetHarness, { accountId: 'b.testnet' }));
    expect(
      await screen.findByRole('heading', { name: 'Boost unavailable' })
    ).toBeTruthy();
    expect(screen.queryByText(/263/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Commit' })).toBeNull();
  });

  it('shows an error and no Commit when the post-tx refresh fails', async () => {
    positionMode = { kind: 'empty' };
    render(createElement(SheetHarness, { accountId: 'alice.testnet' }));
    const amount = await screen.findByRole('textbox', {
      name: 'Amount in SOCIAL',
    });
    fireEvent.change(amount, { target: { value: '1' } });
    positionMode = { kind: 'fail' };
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));
    expect(
      await screen.findByRole('heading', { name: 'Boost unavailable' })
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Commit' })).toBeNull();
    expect(screen.getByRole('alert').textContent).toMatch(
      /Couldn.t load your lock/
    );
  });

  it('treats a kept read past unlock_at as unlockable', async () => {
    positionMode = {
      kind: 'lock',
      unlockAt: 1,
      canUnlock: false,
      expired: false,
    };
    const refreshRef = { current: null } as MutableRefObject<
      ((options?: BoostPositionRefreshOptions) => Promise<void>) | null
    >;
    render(
      createElement(SheetHarness, {
        accountId: 'alice.testnet',
        refreshRef,
      })
    );
    expect(await screen.findByText(/SOCIAL locked/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unlock' })).toBeNull();
    positionMode = { kind: 'fail' };
    await refreshRef.current?.();
    expect(await screen.findByRole('button', { name: 'Unlock' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Commit' })).toBeNull();
  });

  it('treats an empty 200 as a failed read', async () => {
    positionMode = { kind: 'empty-object' };
    render(createElement(SheetHarness, { accountId: 'alice.testnet' }));
    expect(
      await screen.findByRole('heading', { name: 'Boost unavailable' })
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Commit' })).toBeNull();
  });

  it('treats a 200 missing locked_amount as a failed read', async () => {
    positionMode = { kind: 'missing-locked' };
    render(createElement(SheetHarness, { accountId: 'alice.testnet' }));
    expect(
      await screen.findByRole('heading', { name: 'Boost unavailable' })
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Commit' })).toBeNull();
  });

  it('treats a timed-out read as a failed read', async () => {
    positionMode = { kind: 'hang' };
    const { result } = renderHook(() =>
      useBoostPosition('hang.testnet', { live: false })
    );
    await waitFor(
      () => {
        expect(result.current.status).toBe('error');
      },
      { timeout: 20_000 }
    );
    expect(result.current.hasPosition).toBe(false);
  }, 25_000);

  it('shows a retry and no lock mode when the DAO read fails', async () => {
    positionMode = { kind: 'fail' };
    render(
      createElement(DaoBoostSheet, {
        open: true,
        daoAccountId: 'governance.onsocial.testnet',
        daoName: 'Governance',
        eligibility: null,
        onClose: () => {},
      })
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Couldn’t load the DAO’s lock.'
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Propose Boost' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Lock period' })).toBeNull();
  });

  it('keeps Boosters and replaces failed stats with an error', async () => {
    statsMode = 'fail';
    render(createElement(NetworkHarness));
    const network = await screen.findByRole('region', { name: 'Network' });
    expect(await screen.findByText('42')).toBeTruthy();
    expect(network.textContent).toMatch(/Couldn.t load network stats/);
    expect(network.textContent).not.toContain('—');
    expect(screen.queryByText('Locked')).toBeNull();
  });

  it('names the profile mark Boost when the read fails', async () => {
    positionMode = { kind: 'fail' };
    render(
      createElement(PortfolioOwnerPayoutMarks, { accountId: 'alice.testnet' })
    );
    expect(await screen.findByRole('button', { name: 'Boost' })).toBeTruthy();
    expect(
      screen.queryByRole('button', {
        name: 'Boost — lock SOCIAL to grow influence',
      })
    ).toBeNull();
  });

  it('names the leaderboard influence control Boost when the read fails', async () => {
    positionMode = { kind: 'fail' };
    render(
      createElement(LeaderboardSheet, {
        open: true,
        onClose: () => {},
        track: 'influence',
        initialTrack: 'influence',
      })
    );
    expect(await screen.findByRole('button', { name: 'Boost' })).toBeTruthy();
    expect(
      screen.queryByRole('button', {
        name: 'Boost — lock SOCIAL to grow influence',
      })
    ).toBeNull();
  });
});
