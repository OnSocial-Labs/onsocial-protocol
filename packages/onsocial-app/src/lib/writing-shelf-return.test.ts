import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consumeWritingShelf, rememberWritingShelf } from './writing-shelf-return';

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

describe('writing shelf return', () => {
  it('restores only the shelf you left', () => {
    rememberWritingShelf('alice.testnet');
    expect(consumeWritingShelf('bob.testnet')).toBe(false);
    expect(consumeWritingShelf('alice.testnet')).toBe(true);
    expect(consumeWritingShelf('alice.testnet')).toBe(false);
  });
});
