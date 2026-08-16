import { beforeEach, describe, expect, it } from 'vitest';
import {
  archiveSealedDmThreads,
  getDmKeysResetAt,
  isDmThreadSealedArchived,
  recordDmKeysReset,
  reconcileDmThreadArchiveAfterDecrypt,
  unarchiveDmThread,
} from '@/lib/dm/thread-archive';

const ACCOUNT = 'alice.testnet';
const THREAD_A = 'alice.testnet::bob.testnet';
const THREAD_B = 'alice.testnet::carol.testnet';

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

describe('dm thread archive', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('records reset and archives sealed threads', () => {
    recordDmKeysReset(ACCOUNT, '2026-01-01T00:00:00.000Z');
    expect(getDmKeysResetAt(ACCOUNT)).toBe('2026-01-01T00:00:00.000Z');
    archiveSealedDmThreads(ACCOUNT, [THREAD_A, THREAD_B]);
    expect(isDmThreadSealedArchived(ACCOUNT, THREAD_A)).toBe(true);
    expect(isDmThreadSealedArchived(ACCOUNT, THREAD_B)).toBe(true);
  });

  it('unarchives when a message decrypts after reset', () => {
    recordDmKeysReset(ACCOUNT);
    archiveSealedDmThreads(ACCOUNT, [THREAD_A]);
    const change = reconcileDmThreadArchiveAfterDecrypt({
      accountId: ACCOUNT,
      threadId: THREAD_A,
      messageIds: ['m1', 'm2'],
      plainById: {
        m1: 'Unable to decrypt on this device.',
        m2: 'hello again',
      },
      isDecryptFailure: (text) =>
        text === 'Unable to decrypt on this device.',
    });
    expect(change).toBe('unarchived');
    expect(isDmThreadSealedArchived(ACCOUNT, THREAD_A)).toBe(false);
  });

  it('archives when every loaded message fails after a reset', () => {
    recordDmKeysReset(ACCOUNT);
    const change = reconcileDmThreadArchiveAfterDecrypt({
      accountId: ACCOUNT,
      threadId: THREAD_A,
      messageIds: ['m1'],
      plainById: { m1: 'Unable to decrypt on this device.' },
      isDecryptFailure: (text) =>
        text === 'Unable to decrypt on this device.',
    });
    expect(change).toBe('archived');
    expect(isDmThreadSealedArchived(ACCOUNT, THREAD_A)).toBe(true);
  });

  it('does not archive failures when no reset has been recorded', () => {
    const change = reconcileDmThreadArchiveAfterDecrypt({
      accountId: ACCOUNT,
      threadId: THREAD_A,
      messageIds: ['m1'],
      plainById: { m1: 'Unable to decrypt on this device.' },
      isDecryptFailure: (text) =>
        text === 'Unable to decrypt on this device.',
    });
    expect(change).toBe('unchanged');
    expect(isDmThreadSealedArchived(ACCOUNT, THREAD_A)).toBe(false);
  });

  it('can unarchive explicitly', () => {
    archiveSealedDmThreads(ACCOUNT, [THREAD_A]);
    unarchiveDmThread(ACCOUNT, THREAD_A);
    expect(isDmThreadSealedArchived(ACCOUNT, THREAD_A)).toBe(false);
  });
});
