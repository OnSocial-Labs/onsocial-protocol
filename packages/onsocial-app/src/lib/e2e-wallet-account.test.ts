import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  E2E_WALLET_ACCOUNT_KEY,
  readE2eWalletAccountId,
} from '@/lib/e2e-wallet-account';

describe('readE2eWalletAccountId', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    window.localStorage.removeItem(E2E_WALLET_ACCOUNT_KEY);
  });

  it('reads a trimmed account in non-production', () => {
    window.localStorage.setItem(E2E_WALLET_ACCOUNT_KEY, '  alice.near  ');
    expect(readE2eWalletAccountId()).toBe('alice.near');
  });

  it('stays empty in production', () => {
    window.localStorage.setItem(E2E_WALLET_ACCOUNT_KEY, 'alice.near');
    vi.stubEnv('NODE_ENV', 'production');
    expect(readE2eWalletAccountId()).toBeNull();
  });
});
