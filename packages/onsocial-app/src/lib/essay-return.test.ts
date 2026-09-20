import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consumeEssayReopen, rememberEssayReopen } from './essay-return';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    },
  });
});

afterEach(() => {
  store.clear();
});

describe('essay reopen', () => {
  it('opens only the article you left', () => {
    rememberEssayReopen({ accountId: 'alice.testnet', postId: '42' });
    expect(consumeEssayReopen('bob.testnet', '42')).toBe(false);
    expect(consumeEssayReopen('alice.testnet', '42')).toBe(true);
    expect(consumeEssayReopen('alice.testnet', '42')).toBe(false);
  });
});
