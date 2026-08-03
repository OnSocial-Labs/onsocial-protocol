import { describe, expect, it } from 'vitest';
import {
  allowlistPasteHint,
  allowlistPastePlaceholder,
  clampAllowlistAllocation,
  isImplicitNearAccountId,
  isPlausibleNearAccountId,
  looksWrongNetworkAccount,
  parseAllowlistPaste,
} from '@/features/scarces/collection-allowlist-parse';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';

describe('parseAllowlistPaste', () => {
  it('parses space-separated accounts on one line', () => {
    const result = parseAllowlistPaste(
      'elliot.testnet greenghost.testnet pawel.testnet'
    );
    expect(result.entries).toEqual([
      { account_id: 'elliot.testnet', allocation: 1 },
      { account_id: 'greenghost.testnet', allocation: 1 },
      { account_id: 'pawel.testnet', allocation: 1 },
    ]);
    expect(result.invalid).toEqual([]);
  });

  it('parses account + mint cap lines', () => {
    const result = parseAllowlistPaste('alice.testnet 2\nbob.testnet\n');
    expect(result.entries).toEqual([
      { account_id: 'alice.testnet', allocation: 2 },
      { account_id: 'bob.testnet', allocation: 1 },
    ]);
    expect(result.invalid).toEqual([]);
  });

  it('parses mixed caps in a space-separated list', () => {
    const result = parseAllowlistPaste('alice.testnet 2 bob.testnet 3');
    expect(result.entries).toEqual([
      { account_id: 'alice.testnet', allocation: 2 },
      { account_id: 'bob.testnet', allocation: 3 },
    ]);
  });

  it('parses comma-separated accounts on one line', () => {
    const result = parseAllowlistPaste('alice.testnet, bob.testnet 3');
    expect(result.entries).toEqual([
      { account_id: 'alice.testnet', allocation: 1 },
      { account_id: 'bob.testnet', allocation: 3 },
    ]);
  });

  it('keeps allocation 0 for removals', () => {
    expect(parseAllowlistPaste('alice.testnet 0').entries).toEqual([
      { account_id: 'alice.testnet', allocation: 0 },
    ]);
  });

  it('reports invalid tokens', () => {
    const result = parseAllowlistPaste('not-a-wallet!! ok.testnet 1');
    expect(result.entries).toEqual([
      { account_id: 'ok.testnet', allocation: 1 },
    ]);
    expect(result.invalid).toEqual(['not-a-wallet!!']);
  });

  it('dedupes by account id', () => {
    const result = parseAllowlistPaste('alice.testnet 1 alice.testnet 9');
    expect(result.entries).toEqual([
      { account_id: 'alice.testnet', allocation: 1 },
    ]);
  });

  it('clamps pasted caps to drop max per wallet', () => {
    expect(parseAllowlistPaste('alice.testnet 9', 3).entries).toEqual([
      { account_id: 'alice.testnet', allocation: 3 },
    ]);
  });

  it('blocks wrong-network accounts from entries', () => {
    if (ACTIVE_NEAR_NETWORK === 'testnet') {
      const result = parseAllowlistPaste('alice.near 1 bob.testnet 2');
      expect(result.entries).toEqual([
        { account_id: 'bob.testnet', allocation: 2 },
      ]);
      expect(result.wrongNetwork).toEqual(['alice.near']);
    } else {
      const result = parseAllowlistPaste('alice.testnet 1 bob.near 2');
      expect(result.entries).toEqual([{ account_id: 'bob.near', allocation: 2 }]);
      expect(result.wrongNetwork).toEqual(['alice.testnet']);
    }
  });
});

describe('isPlausibleNearAccountId', () => {
  it('accepts named and implicit ids', () => {
    expect(isPlausibleNearAccountId('alice.testnet')).toBe(true);
    expect(isPlausibleNearAccountId('a'.repeat(64))).toBe(true);
    expect(isPlausibleNearAccountId('Bad')).toBe(false);
    expect(isPlausibleNearAccountId('x')).toBe(false);
  });
});

describe('isImplicitNearAccountId', () => {
  it('detects 64-char hex', () => {
    expect(isImplicitNearAccountId('g'.repeat(64))).toBe(false);
    expect(isImplicitNearAccountId('ab'.repeat(32))).toBe(true);
  });
});

describe('looksWrongNetworkAccount', () => {
  it('flags cross-network suffixes for the active app network', () => {
    if (ACTIVE_NEAR_NETWORK === 'testnet') {
      expect(looksWrongNetworkAccount('alice.near')).toBe(true);
      expect(looksWrongNetworkAccount('alice.testnet')).toBe(false);
    } else {
      expect(looksWrongNetworkAccount('alice.testnet')).toBe(true);
      expect(looksWrongNetworkAccount('alice.near')).toBe(false);
    }
  });
});

describe('allowlistPastePlaceholder', () => {
  it('uses an action hint, not sample accounts', () => {
    expect(allowlistPastePlaceholder()).toBe('Paste accounts…');
  });
});

describe('allowlistPasteHint', () => {
  it('shows a compact network-aware example', () => {
    const tld = ACTIVE_NEAR_NETWORK === 'mainnet' ? 'near' : 'testnet';
    expect(allowlistPasteHint(2)).toBe(
      `e.g. alice.${tld} bob.${tld} 2 · tap account to set cap`
    );
  });
});

describe('clampAllowlistAllocation', () => {
  it('floors and bounds mint caps', () => {
    expect(clampAllowlistAllocation(2.9)).toBe(2);
    expect(clampAllowlistAllocation(-1)).toBe(0);
    expect(clampAllowlistAllocation(99_999)).toBe(10_000);
  });

  it('respects drop max per wallet when set', () => {
    expect(clampAllowlistAllocation(9, 3)).toBe(3);
    expect(clampAllowlistAllocation(0, 3)).toBe(0);
  });
});
