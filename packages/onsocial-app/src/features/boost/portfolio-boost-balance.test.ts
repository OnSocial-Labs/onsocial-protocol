// @vitest-environment jsdom
import { createElement } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PortfolioBoostSheet } from '@/features/boost/portfolio-boost-sheet';
import { useBoostPosition } from '@/features/boost/use-boost-position';
import { formatSocialCompact } from '@/lib/format-social-balance';

const signAndSendTransaction = vi.hoisted(() =>
  vi.fn(
    async (_input: {
      actions?: Array<{ params?: { methodName?: string } }>;
    }) => ({
      transaction: { hash: 'a'.repeat(44) },
    })
  )
);

vi.mock('@/contexts/app-wallet-context', () => ({
  useAppWallet: () => ({
    accountId: 'alice.testnet',
    isConnected: true,
    isLoading: false,
    connect: async () => {},
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
      wallet: { signAndSendTransaction },
    }),
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

const SOCIAL = 10n ** 18n;
const ALICE = 'alice.testnet';
const BOB = 'bob.testnet';

function yocto(whole: bigint): string {
  return (whole * SOCIAL).toString();
}

function availableLabel(whole: bigint): string {
  return `${formatSocialCompact(whole * SOCIAL)} available`;
}

type PendingBalance = {
  accountId: string;
  resolve: (response: Response) => void;
};

let pendingBalances: PendingBalance[] = [];
let balanceRequests: string[] = [];
let lockedWhole = 0n;
let claimableWhole = 0n;
let canUnlock = false;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function accountBody(amount: string) {
  const empty = amount === '0';
  return {
    locked_amount: amount,
    unlock_at: 0,
    lock_months: empty ? 0 : 12,
    effective_boost: empty ? '0' : yocto(300n),
    claimable_rewards: '0',
    boost_seconds: '0',
    rewards_claimed: '0',
  };
}

function lockBody(amount: string) {
  const empty = amount === '0';
  return {
    is_locked: !empty,
    locked_amount: amount,
    lock_months: empty ? 0 : 12,
    unlock_at: 0,
    can_unlock: canUnlock,
    time_remaining_ns: 0,
    bonus_percent: empty ? 0 : 20,
    effective_boost: empty ? '0' : yocto(300n),
    lock_expired: canUnlock,
  };
}

function statsBody() {
  return {
    version: '0.1.0',
    token_id: 'token.onsocial.testnet',
    owner_id: 'onsocial.testnet',
    total_locked: yocto(50_000n),
    total_effective_boost: yocto(50_000n),
    total_boost_seconds: '0',
    total_rewards_released: '0',
    scheduled_pool: yocto(50_000n),
    infra_pool: '0',
    last_release_time: 0,
    active_weekly_rate_bps: 125,
    release_schedule_start_ns: 0,
    initial_weekly_rate_bps: 125,
    rate_step_bps: 0,
    rate_step_interval_months: 0,
    max_weekly_rate_bps: 125,
  };
}

function installFetch() {
  pendingBalances = [];
  balanceRequests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/token/balance')) {
        const accountId =
          new URL(url, 'http://localhost').searchParams.get('accountId') ?? '';
        balanceRequests.push(accountId);
        return new Promise<Response>((resolve) => {
          pendingBalances.push({ accountId, resolve });
        });
      }
      if (url.includes('/api/boost-network')) {
        return jsonResponse({ boosterCount: 42 });
      }
      if (url.includes('boost-stats')) return jsonResponse(statsBody());
      const amount = lockedWhole === 0n ? '0' : yocto(lockedWhole);
      if (url.includes('boost-lock-status'))
        return jsonResponse(lockBody(amount));
      if (url.includes('boost-rewards-live')) {
        return jsonResponse({
          claimable_rewards: yocto(claimableWhole),
          rewards_per_second: '0',
          as_of_timestamp_ns: 1_700_000_000_000_000,
          effective_boost: '0',
          total_effective_boost: yocto(10_000n),
        });
      }
      if (url.includes('boost-account')) {
        return jsonResponse(accountBody(amount));
      }
      return jsonResponse({});
    })
  );
}

function releaseBalance(accountId: string, whole: bigint | 'fail') {
  const index = pendingBalances.findIndex(
    (item) => item.accountId === accountId
  );
  if (index < 0) {
    throw new Error(`No pending balance read for ${accountId}`);
  }
  const [pending] = pendingBalances.splice(index, 1);
  pending.resolve(
    whole === 'fail'
      ? jsonResponse({ error: 'unavailable' }, 502)
      : jsonResponse({ balanceYocto: yocto(whole) })
  );
}

async function settle(accountId: string, whole: bigint | 'fail') {
  await act(async () => {
    releaseBalance(accountId, whole);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function Harness({ open, accountId }: { open: boolean; accountId: string }) {
  const position = useBoostPosition(accountId, { live: false });
  return createElement(PortfolioBoostSheet, {
    open,
    accountId,
    position,
    onOpenChange: () => {},
  });
}

function footerButton(name: string): HTMLButtonElement {
  const match = screen
    .getAllByRole('button', { name })
    .find((button) => button.classList.contains('os-sheet-action'));
  if (!match) throw new Error(`No footer button named ${name}`);
  return match as HTMLButtonElement;
}

function amountInput(): HTMLInputElement {
  return screen.getByRole('textbox', {
    name: 'Amount in SOCIAL',
  }) as HTMLInputElement;
}

beforeEach(() => {
  lockedWhole = 0n;
  claimableWhole = 0n;
  canUnlock = false;
  signAndSendTransaction.mockClear();
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

describe('boost sheet wallet balance', () => {
  it('drops the previous balance when the account changes while closed', async () => {
    const { rerender } = render(
      createElement(Harness, { open: true, accountId: ALICE })
    );
    await screen.findByRole('heading', { name: 'Lock SOCIAL' });
    await settle(ALICE, 1_500_000n);
    expect(screen.getByText(availableLabel(1_500_000n))).toBeTruthy();

    rerender(createElement(Harness, { open: false, accountId: ALICE }));
    rerender(createElement(Harness, { open: false, accountId: BOB }));

    await screen.findByRole('textbox', {
      name: 'Amount in SOCIAL',
      hidden: true,
    });
    expect(screen.queryByText(availableLabel(1_500_000n))).toBeNull();
    expect(
      (
        screen.getByRole('button', {
          name: 'Max',
          hidden: true,
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);

    rerender(createElement(Harness, { open: true, accountId: BOB }));
    const amount = await screen.findByRole('textbox', {
      name: 'Amount in SOCIAL',
    });
    expect(screen.queryByText(availableLabel(1_500_000n))).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Max' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    fireEvent.change(amount, { target: { value: '1' } });
    expect(footerButton('Commit').disabled).toBe(true);

    await settle(BOB, 20n);
    expect(await screen.findByText(availableLabel(20n))).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Max' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    expect(footerButton('Commit').disabled).toBe(false);
  });

  it('ignores a late balance response for the previous account', async () => {
    const { rerender } = render(
      createElement(Harness, { open: true, accountId: ALICE })
    );
    await screen.findByRole('heading', { name: 'Lock SOCIAL' });
    expect(balanceRequests).toContain(ALICE);

    rerender(createElement(Harness, { open: true, accountId: BOB }));
    await screen.findByRole('heading', { name: 'Lock SOCIAL' });
    await settle(BOB, 4n);
    expect(screen.getByText(availableLabel(4n))).toBeTruthy();

    await settle(ALICE, 1_500_000n);
    expect(screen.queryByText(availableLabel(1_500_000n))).toBeNull();
    expect(screen.getByText(availableLabel(4n))).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Max' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  it('keeps submit disabled and Max inert when the balance is missing', async () => {
    render(createElement(Harness, { open: true, accountId: ALICE }));
    await screen.findByRole('heading', { name: 'Lock SOCIAL' });
    await settle(ALICE, 'fail');
    fireEvent.click(screen.getByRole('button', { name: 'Max' }));
    expect(amountInput().value).toBe('');
    fireEvent.change(amountInput(), { target: { value: '1' } });
    const commitDisabled = footerButton('Commit').disabled;
    const maxDisabled = (
      screen.getByRole('button', { name: 'Max' }) as HTMLButtonElement
    ).disabled;
    fireEvent.click(footerButton('Commit'));
    const commitSigned = signAndSendTransaction.mock.calls.length;

    cleanup();
    signAndSendTransaction.mockClear();
    lockedWhole = 263n;
    const increaseView = render(
      createElement(Harness, { open: true, accountId: ALICE })
    );
    await screen.findByRole('button', { name: 'Increase' });
    await settle(ALICE, 'fail');
    fireEvent.click(screen.getByRole('button', { name: 'Increase' }));
    fireEvent.click(screen.getByRole('button', { name: 'Max' }));
    expect(amountInput().value).toBe('');
    fireEvent.change(amountInput(), { target: { value: '1' } });
    const increaseDisabled = footerButton('Increase').disabled;
    fireEvent.click(footerButton('Increase'));

    expect(commitDisabled).toBe(true);
    expect(maxDisabled).toBe(true);
    expect(commitSigned).toBe(0);
    expect(increaseDisabled).toBe(true);
    expect(signAndSendTransaction).not.toHaveBeenCalled();
    increaseView.unmount();
  });

  it('refetches the wallet balance after commit, collect, and unlock', async () => {
    render(createElement(Harness, { open: true, accountId: ALICE }));
    await screen.findByRole('heading', { name: 'Lock SOCIAL' });
    await settle(ALICE, 100n);
    fireEvent.change(amountInput(), { target: { value: '1' } });
    const commitReads = balanceRequests.length;
    fireEvent.click(footerButton('Commit'));
    await waitFor(() => expect(balanceRequests.length).toBe(commitReads + 1));
    expect(signAndSendTransaction.mock.calls.at(-1)?.[0]).toMatchObject({
      actions: [{ params: { methodName: 'ft_transfer_call' } }],
    });
    await settle(ALICE, 90n);
    expect(await screen.findByText(availableLabel(90n))).toBeTruthy();

    cleanup();
    signAndSendTransaction.mockClear();
    lockedWhole = 263n;
    claimableWhole = 1n;
    render(createElement(Harness, { open: true, accountId: ALICE }));
    await waitFor(() => {
      footerButton('Collect');
    });
    await settle(ALICE, 100n);
    const collectReads = balanceRequests.length;
    fireEvent.click(footerButton('Collect'));
    await waitFor(() => expect(balanceRequests.length).toBe(collectReads + 1));
    expect(signAndSendTransaction.mock.calls.at(-1)?.[0]).toMatchObject({
      actions: [{ params: { methodName: 'claim_rewards' } }],
    });
    await settle(ALICE, 40n);
    fireEvent.click(screen.getByRole('button', { name: 'Increase' }));
    expect(await screen.findByText(availableLabel(40n))).toBeTruthy();

    cleanup();
    signAndSendTransaction.mockClear();
    canUnlock = true;
    claimableWhole = 0n;
    render(createElement(Harness, { open: true, accountId: ALICE }));
    await screen.findByRole('button', { name: 'Unlock + collect' });
    await settle(ALICE, 100n);
    const unlockReads = balanceRequests.length;
    fireEvent.click(footerButton('Unlock + collect'));
    await waitFor(() => expect(balanceRequests.length).toBe(unlockReads + 1));
    expect(signAndSendTransaction.mock.calls.at(-1)?.[0]).toMatchObject({
      actions: [{ params: { methodName: 'unlock' } }],
    });
  });
});
