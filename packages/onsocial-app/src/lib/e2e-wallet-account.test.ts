import { afterEach, describe, expect, it, vi } from 'vitest';
import { e2eWalletPaintAllowed } from './e2e-wallet-account';

describe('e2eWalletPaintAllowed', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows paint outside production', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_E2E_WALLET', '');
    expect(e2eWalletPaintAllowed()).toBe(true);
  });

  it('blocks production without the public flag', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_E2E_WALLET', '');
    expect(e2eWalletPaintAllowed()).toBe(false);
  });

  it('allows production when CI sets NEXT_PUBLIC_E2E_WALLET=1', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_E2E_WALLET', '1');
    expect(e2eWalletPaintAllowed()).toBe(true);
  });
});
