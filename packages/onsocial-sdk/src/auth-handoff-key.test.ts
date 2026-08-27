import { afterEach, describe, expect, it } from 'vitest';
import { readAppHandoffKey, writeAppHandoffKey } from './auth-handoff-key.js';

describe('app handoff key store', () => {
  const memory = new Map<string, string>();

  afterEach(() => {
    memory.clear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).localStorage;
  });

  it('round-trips a pending dapp key', () => {
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

    writeAppHandoffKey({
      appId: 'tracker',
      publicKey: 'ed25519:abc',
      secretSeedB64u: 'seed',
      osOrigin: 'https://onsocial.id',
    });
    expect(readAppHandoffKey('Tracker')).toEqual({
      appId: 'tracker',
      publicKey: 'ed25519:abc',
      secretSeedB64u: 'seed',
      osOrigin: 'https://onsocial.id',
    });
    expect(readAppHandoffKey('dating')).toBeNull();
  });
});
