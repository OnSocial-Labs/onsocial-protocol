import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readLastProtocolPolicyAction,
  rememberProtocolPolicyAction,
} from '@/features/protocol/protocol-policy';

function installMemoryLocalStorage() {
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
    get length() {
      return store.size;
    },
  };
  vi.stubGlobal('window', { localStorage });
  return localStorage;
}

describe('rememberProtocolPolicyAction', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the highlighted settings action on the DAO that chose it', () => {
    rememberProtocolPolicyAction('alpha.sputnik-dao.near', 'update_config');
    rememberProtocolPolicyAction('beta.sputnik-dao.near', 'add_role');

    expect(readLastProtocolPolicyAction('alpha.sputnik-dao.near')).toBe(
      'update_config'
    );
    expect(readLastProtocolPolicyAction('BETA.sputnik-dao.near')).toBe(
      'add_role'
    );
    expect(readLastProtocolPolicyAction('gamma.sputnik-dao.near')).toBeNull();
  });

  it('ignores a missing DAO id', () => {
    rememberProtocolPolicyAction(null, 'update_vote_policy');
    rememberProtocolPolicyAction('  ', 'update_permissions');

    expect(readLastProtocolPolicyAction(null)).toBeNull();
    expect(readLastProtocolPolicyAction('')).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });
});
