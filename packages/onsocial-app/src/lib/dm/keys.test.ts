import { beforeEach, describe, expect, it } from 'vitest';
import {
  encodeDmPublicKey,
  generateDmKeyPair,
  generateDmRecoveryCode,
  recoveryCodeToWrapKey,
  wrapDmSecretKey,
} from '@/lib/dm/crypto';
import {
  DmKeysLockedError,
  ensureDmKeys,
  hasUnlockedDmKey,
  restoreDmKeysFromRecoveryCode,
} from '@/lib/dm/keys';

const ACCOUNT = 'alice.testnet';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorage,
    configurable: true,
  });
}

describe('dm keys bootstrap', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('creates keys when no remote backup exists', async () => {
    const result = await ensureDmKeys(ACCOUNT, { remoteBackup: null });
    expect(result.created).toBe(true);
    expect(result.recoveryCode).toBeTruthy();
    expect(hasUnlockedDmKey(ACCOUNT)).toBe(true);
  });

  it('refuses to mint over an existing remote backup', async () => {
    const keyPair = generateDmKeyPair();
    const code = generateDmRecoveryCode();
    const wrapKey = await recoveryCodeToWrapKey(code);
    const wrapped = await wrapDmSecretKey({
      secretKey: keyPair.secretKey,
      wrapKey,
    });
    const remoteBackup = {
      publicKey: encodeDmPublicKey(keyPair.publicKey),
      wrapped,
    };

    await expect(
      ensureDmKeys(ACCOUNT, { remoteBackup })
    ).rejects.toBeInstanceOf(DmKeysLockedError);
    expect(hasUnlockedDmKey(ACCOUNT)).toBe(false);

    await restoreDmKeysFromRecoveryCode({
      accountId: ACCOUNT,
      recoveryCode: code,
      remoteBackup,
    });
    expect(hasUnlockedDmKey(ACCOUNT)).toBe(true);

    const again = await ensureDmKeys(ACCOUNT, { remoteBackup });
    expect(again.created).toBe(false);
    expect(Array.from(again.keyPair.publicKey)).toEqual(
      Array.from(keyPair.publicKey)
    );
  });
});
