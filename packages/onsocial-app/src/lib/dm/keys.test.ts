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
  DmKeysMismatchError,
  DmKeysUnavailableError,
  __resetDmKeyMemoryForTests,
  acknowledgeDmRecoveryCode,
  ensureDmKeys,
  hasUnlockedDmKey,
  peekPendingDmRecoveryCode,
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
    __resetDmKeyMemoryForTests();
  });

  it('creates keys when remote is verified absent', async () => {
    const result = await ensureDmKeys(ACCOUNT, {
      remote: { status: 'absent' },
    });
    expect(result.created).toBe(true);
    expect(result.recoveryCode).toBeTruthy();
    expect(peekPendingDmRecoveryCode(ACCOUNT)).toBe(result.recoveryCode);
    expect(hasUnlockedDmKey(ACCOUNT)).toBe(true);
  });

  it('keeps pending recovery code until acknowledged', async () => {
    const first = await ensureDmKeys(ACCOUNT, {
      remote: { status: 'absent' },
    });
    const again = await ensureDmKeys(ACCOUNT, {
      remote: { status: 'absent' },
    });
    expect(again.created).toBe(false);
    expect(again.recoveryCode).toBe(first.recoveryCode);
    acknowledgeDmRecoveryCode(ACCOUNT);
    expect(peekPendingDmRecoveryCode(ACCOUNT)).toBeNull();
    const afterAck = await ensureDmKeys(ACCOUNT, {
      remote: { status: 'absent' },
    });
    expect(afterAck.recoveryCode).toBeNull();
  });

  it('refuses to mint when remote lookup is unavailable', async () => {
    await expect(
      ensureDmKeys(ACCOUNT, {
        remote: { status: 'unavailable', cause: new Error('network') },
      })
    ).rejects.toBeInstanceOf(DmKeysUnavailableError);
    expect(hasUnlockedDmKey(ACCOUNT)).toBe(false);
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
      ensureDmKeys(ACCOUNT, {
        remote: { status: 'found', value: remoteBackup },
      })
    ).rejects.toBeInstanceOf(DmKeysLockedError);
    expect(hasUnlockedDmKey(ACCOUNT)).toBe(false);

    await restoreDmKeysFromRecoveryCode({
      accountId: ACCOUNT,
      recoveryCode: code,
      remoteBackup,
    });
    expect(hasUnlockedDmKey(ACCOUNT)).toBe(true);

    const again = await ensureDmKeys(ACCOUNT, {
      remote: { status: 'found', value: remoteBackup },
    });
    expect(again.created).toBe(false);
    expect(Array.from(again.keyPair.publicKey)).toEqual(
      Array.from(keyPair.publicKey)
    );
  });

  it('detects local/remote identity mismatch', async () => {
    await ensureDmKeys(ACCOUNT, { remote: { status: 'absent' } });
    const other = generateDmKeyPair();
    const code = generateDmRecoveryCode();
    const wrapKey = await recoveryCodeToWrapKey(code);
    const wrapped = await wrapDmSecretKey({
      secretKey: other.secretKey,
      wrapKey,
    });
    await expect(
      ensureDmKeys(ACCOUNT, {
        remote: {
          status: 'found',
          value: {
            publicKey: encodeDmPublicKey(other.publicKey),
            wrapped,
          },
        },
      })
    ).rejects.toBeInstanceOf(DmKeysMismatchError);
  });

  it('rejects recovery restore when wrap public key does not match secret', async () => {
    const keyPair = generateDmKeyPair();
    const other = generateDmKeyPair();
    const code = generateDmRecoveryCode();
    const wrapKey = await recoveryCodeToWrapKey(code);
    const wrapped = await wrapDmSecretKey({
      secretKey: keyPair.secretKey,
      wrapKey,
    });
    await expect(
      restoreDmKeysFromRecoveryCode({
        accountId: ACCOUNT,
        recoveryCode: code,
        remoteBackup: {
          publicKey: encodeDmPublicKey(other.publicKey),
          wrapped,
        },
      })
    ).rejects.toBeInstanceOf(DmKeysMismatchError);
  });
});
