import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WELCOME_NEAR_THRESHOLD_YOCTO } from '@/lib/app-session-sponsor';

const viewAccount = vi.fn();

vi.mock('@/lib/app-near-rpc', () => ({
  viewAccount: (...args: unknown[]) => viewAccount(...args),
}));

import { fundAppSessionIfNeeded } from '@/lib/welcome-near';

function account(liquid: bigint) {
  return { amount: liquid.toString(), locked: '0' };
}

describe('fundAppSessionIfNeeded', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    viewAccount.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not call the sponsor when the balance is already enough', async () => {
    viewAccount.mockResolvedValue(account(WELCOME_NEAR_THRESHOLD_YOCTO));
    await fundAppSessionIfNeeded('alice.testnet');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when the sponsor says the balance is enough but it is still short', async () => {
    viewAccount.mockResolvedValue(account(1n));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        dripped: false,
        sufficient_balance: true,
      }),
    });
    await expect(fundAppSessionIfNeeded('alice.testnet')).rejects.toThrow(
      /did not finish/
    );
  });

  it('returns when a later read shows the balance arrived', async () => {
    viewAccount
      .mockResolvedValueOnce(account(1n))
      .mockResolvedValue(account(WELCOME_NEAR_THRESHOLD_YOCTO));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, enabled: false, dripped: false }),
    });
    await fundAppSessionIfNeeded('alice.testnet');
  });

  it('throws when the sponsor is off and the account is still short', async () => {
    viewAccount.mockResolvedValue(account(1n));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, enabled: false, dripped: false }),
    });
    await expect(fundAppSessionIfNeeded('alice.testnet')).rejects.toThrow(
      /did not finish/
    );
  });

  it('waits out a drip and returns once the balance arrives', async () => {
    viewAccount
      .mockResolvedValueOnce(account(1n))
      .mockResolvedValue(account(WELCOME_NEAR_THRESHOLD_YOCTO));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, enabled: true, dripped: true }),
    });
    vi.useFakeTimers();
    const pending = fundAppSessionIfNeeded('alice.testnet');
    await vi.runAllTimersAsync();
    await pending;
  });

  it('throws when a drip never arrives', async () => {
    viewAccount.mockResolvedValue(account(1n));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, enabled: true, dripped: true }),
    });
    vi.useFakeTimers();
    const pending = fundAppSessionIfNeeded('alice.testnet');
    const assertion = expect(pending).rejects.toThrow(/did not finish/);
    await vi.runAllTimersAsync();
    await assertion;
  });
});
