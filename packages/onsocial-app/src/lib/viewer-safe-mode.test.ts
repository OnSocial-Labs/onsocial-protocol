import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  SAFE_MODE_STORAGE_KEY,
  readSafeMode,
  writeSafeMode,
} from './viewer-safe-mode';

describe('viewer-safe-mode', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to ON when unset', () => {
    expect(readSafeMode()).toBe(true);
  });

  it('persists off and on', () => {
    writeSafeMode(false);
    expect(store.get(SAFE_MODE_STORAGE_KEY)).toBe('0');
    expect(readSafeMode()).toBe(false);
    writeSafeMode(true);
    expect(store.get(SAFE_MODE_STORAGE_KEY)).toBe('1');
    expect(readSafeMode()).toBe(true);
  });
});
