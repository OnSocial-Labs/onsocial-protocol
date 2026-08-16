import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  encodeDmPublicKey,
  encodeDmSecretKey,
  generateDmKeyPair,
  generateDmRecoveryCode,
  recoveryCodeToWrapKey,
  wrapDmSecretKey,
} from '@/lib/dm/crypto';

const publishDmKeyBackup = vi.fn();
const lookupDmKeyBackup = vi.fn();

vi.mock('@/lib/dm/pubkey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/dm/pubkey')>();
  return {
    ...actual,
    publishDmKeyBackup: (...args: unknown[]) => publishDmKeyBackup(...args),
    lookupDmKeyBackup: (...args: unknown[]) => lookupDmKeyBackup(...args),
  };
});

import {
  DmKeysLockedError,
  DmKeysMismatchError,
  DmKeysUnavailableError,
  __peekPendingDmRotationForTests,
  __resetDmKeyMemoryForTests,
  acknowledgeDmRecoveryCode,
  clearDmKeysLocal,
  ensureDmKeys,
  getStoredDmIdentity,
  hasDmPasskeyEnrolled,
  hasUnlockedDmKey,
  peekPendingDmRecoveryCode,
  resetDmMessagingKeys,
  restoreDmKeysFromRecoveryCode,
} from '@/lib/dm/keys';
import { getDmKeysResetAt } from '@/lib/dm/thread-archive';
import type { OnSocial } from '@onsocial/sdk';

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
    publishDmKeyBackup.mockReset();
    lookupDmKeyBackup.mockReset();
    publishDmKeyBackup.mockResolvedValue(undefined);
    lookupDmKeyBackup.mockResolvedValue({ status: 'absent' });
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

  it('detects local/remote identity mismatch without destroying local wrap', async () => {
    const local = await ensureDmKeys(ACCOUNT, { remote: { status: 'absent' } });
    const localBackup = {
      publicKey: local.publicKeyEncoded,
      wrapped: local.backup!.wrapped,
    };
    // Stale passkey for the old identity — must be cleared on remote reset.
    window.localStorage.setItem(
      `onsocial.app.dm.${ACCOUNT}`,
      JSON.stringify({
        ...JSON.parse(window.localStorage.getItem(`onsocial.app.dm.${ACCOUNT}`)!),
        passkeyWrapped: {
          ciphertext: 'x',
          nonce: 'y',
          credentialId: 'cred',
        },
      })
    );
    expect(hasDmPasskeyEnrolled(ACCOUNT)).toBe(true);

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
    expect(hasUnlockedDmKey(ACCOUNT)).toBe(false);
    expect(hasDmPasskeyEnrolled(ACCOUNT)).toBe(false);

    const stored = JSON.parse(
      window.localStorage.getItem(`onsocial.app.dm.${ACCOUNT}`)!
    ) as {
      publicKey: string;
      wrapped: { ciphertext: string; nonce: string };
      quarantinedRemote?: { publicKey: string };
      passkeyWrapped?: unknown;
    };
    expect(stored.publicKey).toBe(localBackup.publicKey);
    expect(stored.wrapped).toEqual(localBackup.wrapped);
    expect(stored.passkeyWrapped).toBeUndefined();
    expect(stored.quarantinedRemote?.publicKey).toBe(
      encodeDmPublicKey(other.publicKey)
    );

    await restoreDmKeysFromRecoveryCode({
      accountId: ACCOUNT,
      recoveryCode: code,
      remoteBackup: {
        publicKey: encodeDmPublicKey(other.publicKey),
        wrapped,
      },
      preferRemote: true,
    });
    expect(hasUnlockedDmKey(ACCOUNT)).toBe(true);
    expect(getDmKeysResetAt(ACCOUNT)).toBeTruthy();
    const again = await ensureDmKeys(ACCOUNT, {
      remote: {
        status: 'found',
        value: {
          publicKey: encodeDmPublicKey(other.publicKey),
          wrapped,
        },
      },
    });
    expect(Array.from(again.keyPair.publicKey)).toEqual(
      Array.from(other.publicKey)
    );
  });

  it('refuses to mint over corrupt local identity material', async () => {
    window.localStorage.setItem(
      `onsocial.app.dm.${ACCOUNT}`,
      JSON.stringify({
        accountId: ACCOUNT,
        publicKey: 'not-a-valid-key',
        secretKey: 'also-invalid',
        createdAt: new Date().toISOString(),
      })
    );
    await expect(
      ensureDmKeys(ACCOUNT, { remote: { status: 'absent' } })
    ).rejects.toBeInstanceOf(DmKeysLockedError);
    expect(hasUnlockedDmKey(ACCOUNT)).toBe(false);
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

  it('resets messaging keys after publish confirms, abandoning prior local identity', async () => {
    const prior = await ensureDmKeys(ACCOUNT, { remote: { status: 'absent' } });
    const priorCode = prior.recoveryCode!;
    acknowledgeDmRecoveryCode(ACCOUNT);

    lookupDmKeyBackup.mockResolvedValue({
      status: 'found',
      value: prior.backup!,
    });

    const client = {} as OnSocial;
    const reset = await resetDmMessagingKeys({ accountId: ACCOUNT, client });
    expect(publishDmKeyBackup).toHaveBeenCalledTimes(1);
    expect(reset.recoveryCode).toBeTruthy();
    expect(reset.recoveryCode).not.toBe(priorCode);
    expect(hasUnlockedDmKey(ACCOUNT)).toBe(true);
    expect(peekPendingDmRecoveryCode(ACCOUNT)).toBe(reset.recoveryCode);
    expect(getStoredDmIdentity(ACCOUNT)?.publicKey).toBe(reset.publicKeyEncoded);
    expect(getStoredDmIdentity(ACCOUNT)?.keysResetAt).toBeTruthy();
    expect(getDmKeysResetAt(ACCOUNT)).toBeTruthy();
    expect(__peekPendingDmRotationForTests(ACCOUNT)).toBeNull();

    await expect(
      restoreDmKeysFromRecoveryCode({
        accountId: ACCOUNT,
        recoveryCode: priorCode,
        remoteBackup: reset.backup,
        preferRemote: true,
      })
    ).rejects.toThrow(/Invalid recovery code/);
  });

  it('leaves prior local keys intact when reset publish fails', async () => {
    const prior = await ensureDmKeys(ACCOUNT, { remote: { status: 'absent' } });
    const priorPk = prior.publicKeyEncoded;
    lookupDmKeyBackup.mockResolvedValue({
      status: 'found',
      value: prior.backup!,
    });
    publishDmKeyBackup.mockRejectedValueOnce(new Error('chain down'));

    await expect(
      resetDmMessagingKeys({ accountId: ACCOUNT, client: {} as OnSocial })
    ).rejects.toThrow(/chain down/);

    expect(hasUnlockedDmKey(ACCOUNT)).toBe(true);
    expect(getStoredDmIdentity(ACCOUNT)?.publicKey).toBe(priorPk);
    expect(__peekPendingDmRotationForTests(ACCOUNT)).toBeNull();
  });

  it('resumes pending rotation when profile matches after crash', async () => {
    const keyPair = generateDmKeyPair();
    const code = generateDmRecoveryCode();
    const wrapKey = await recoveryCodeToWrapKey(code);
    const wrapped = await wrapDmSecretKey({
      secretKey: keyPair.secretKey,
      wrapKey,
    });
    const publicKey = encodeDmPublicKey(keyPair.publicKey);
    const secretKey = encodeDmSecretKey(keyPair.secretKey);
    window.localStorage.setItem(
      `onsocial.app.dm.pending-rotation.${ACCOUNT}`,
      JSON.stringify({
        accountId: ACCOUNT,
        publicKey,
        secretKey,
        wrapped,
        recoveryCode: code,
        createdAt: new Date().toISOString(),
      })
    );

    const result = await ensureDmKeys(ACCOUNT, {
      remote: {
        status: 'found',
        value: { publicKey, wrapped },
      },
    });

    expect(result.fromPendingRotation).toBe(true);
    expect(hasUnlockedDmKey(ACCOUNT)).toBe(true);
    expect(peekPendingDmRecoveryCode(ACCOUNT)).toBe(code);
    expect(__peekPendingDmRotationForTests(ACCOUNT)).toBeNull();
    expect(getDmKeysResetAt(ACCOUNT)).toBeTruthy();
    expect(getStoredDmIdentity(ACCOUNT)?.keysResetAt).toBeTruthy();
  });

  it('refuses reset when profile lookup is unavailable', async () => {
    lookupDmKeyBackup.mockResolvedValue({
      status: 'unavailable',
      cause: new Error('network'),
    });
    await expect(
      resetDmMessagingKeys({ accountId: ACCOUNT, client: {} as OnSocial })
    ).rejects.toBeInstanceOf(DmKeysUnavailableError);
  });

  it('refuses to unlock a stale local wrap after profile reset', async () => {
    const prior = await ensureDmKeys(ACCOUNT, { remote: { status: 'absent' } });
    const priorCode = prior.recoveryCode!;
    acknowledgeDmRecoveryCode(ACCOUNT);

    const rotated = generateDmKeyPair();
    const newCode = generateDmRecoveryCode();
    const wrapKey = await recoveryCodeToWrapKey(newCode);
    const rotatedWrap = await wrapDmSecretKey({
      secretKey: rotated.secretKey,
      wrapKey,
    });
    const remoteBackup = {
      publicKey: encodeDmPublicKey(rotated.publicKey),
      wrapped: rotatedWrap,
    };

    await expect(
      restoreDmKeysFromRecoveryCode({
        accountId: ACCOUNT,
        recoveryCode: priorCode,
        remoteBackup,
        preferRemote: true,
      })
    ).rejects.toBeInstanceOf(DmKeysMismatchError);

    // New code against remote still works.
    const restored = await restoreDmKeysFromRecoveryCode({
      accountId: ACCOUNT,
      recoveryCode: newCode,
      remoteBackup,
      preferRemote: true,
    });
    expect(Array.from(restored.publicKey)).toEqual(
      Array.from(rotated.publicKey)
    );
  });
});
