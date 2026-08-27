import { afterEach, describe, expect, it } from 'vitest';
import {
  clearAppHandoffSession,
  readAppHandoffSession,
  writeAppHandoffSession,
} from './auth-handoff-session.js';

describe('app handoff session store', () => {
  const memory = new Map<string, string>();

  afterEach(() => {
    memory.clear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).localStorage;
  });

  function installStorage() {
    const localStorage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorage,
    });
  }

  it('round-trips an app refresh token', () => {
    installStorage();
    writeAppHandoffSession({
      appId: 'Tracker',
      accountId: 'bob.testnet',
      refreshToken: 'app.refresh.jwt',
    });
    expect(readAppHandoffSession('tracker')).toEqual({
      appId: 'tracker',
      accountId: 'bob.testnet',
      refreshToken: 'app.refresh.jwt',
    });
    clearAppHandoffSession('Tracker');
    expect(readAppHandoffSession('tracker')).toBeNull();
  });
});
