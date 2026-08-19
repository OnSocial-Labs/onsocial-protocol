import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/app-config', () => ({
  GOVERNANCE_DAO_ACCOUNT: 'governance.onsocial.testnet',
  TREASURY_DAO_ACCOUNT: 'treasury.onsocial.testnet',
}));

vi.mock('@/features/protocol/dao-accounts', () => ({
  readRecentCommunityDaos: () => ['visited.community.near'],
}));

import {
  isDaoStandingTarget,
  rememberDaoStandingTarget,
} from '@/lib/dao-standing-account';

function stubLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  vi.stubGlobal('window', { localStorage });
  return localStorage;
}

describe('dao-standing-account', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('trusts server isDao true', () => {
    stubLocalStorage();
    expect(isDaoStandingTarget('custom.near', true)).toBe(true);
  });

  it('treats protocol and sputnik DAOs as DAO targets', () => {
    stubLocalStorage();
    expect(isDaoStandingTarget('governance.onsocial.testnet')).toBe(true);
    expect(isDaoStandingTarget('demo.sputnik-dao.near')).toBe(true);
  });

  it('keeps unknown people accounts as non-DAO targets', () => {
    stubLocalStorage();
    expect(isDaoStandingTarget('alice.near')).toBe(false);
  });

  it('remembers visited / stood-with DAO targets', () => {
    stubLocalStorage();
    expect(isDaoStandingTarget('custom-dao.near')).toBe(false);
    rememberDaoStandingTarget('custom-dao.near');
    expect(isDaoStandingTarget('custom-dao.near')).toBe(true);
  });

  it('includes recently visited community DAOs', () => {
    stubLocalStorage();
    expect(isDaoStandingTarget('visited.community.near')).toBe(true);
  });
});
