import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  APP_WALLET_ACCOUNT_HINT_COOKIE,
  parseWalletAccountHint,
  walletAccountHintFromCookie,
  writeWalletAccountHintCookie,
} from '@/lib/wallet-account-hint';

describe('wallet account hint', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts NEAR account ids and rejects junk', () => {
    expect(parseWalletAccountHint('Alice.near')).toBe('alice.near');
    expect(parseWalletAccountHint(' greenghost.onsocial.testnet ')).toBe(
      'greenghost.onsocial.testnet'
    );
    expect(parseWalletAccountHint('../evil')).toBeNull();
    expect(parseWalletAccountHint('')).toBeNull();
    expect(parseWalletAccountHint(null)).toBeNull();
  });

  it('decodes cookie values from Next cookies()', () => {
    expect(
      walletAccountHintFromCookie(encodeURIComponent('alice.near'))
    ).toBe('alice.near');
    expect(walletAccountHintFromCookie('bob.testnet')).toBe('bob.testnet');
    expect(walletAccountHintFromCookie('not an id')).toBeNull();
  });

  it('writes and clears the hint cookie', () => {
    const writes: string[] = [];
    vi.stubGlobal('document', {
      get cookie() {
        return writes.at(-1) ?? '';
      },
      set cookie(value: string) {
        writes.push(value);
      },
    });
    writeWalletAccountHintCookie('Alice.near');
    expect(writes.at(-1)).toContain(
      `${APP_WALLET_ACCOUNT_HINT_COOKIE}=${encodeURIComponent('alice.near')}`
    );
    expect(writes.at(-1)).toContain('SameSite=Lax');
    writeWalletAccountHintCookie(null);
    expect(writes.at(-1)).toContain(`${APP_WALLET_ACCOUNT_HINT_COOKIE}=`);
    expect(writes.at(-1)).toContain('Max-Age=0');
  });
});
