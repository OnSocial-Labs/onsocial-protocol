import { describe, expect, it } from 'vitest';
import { formatPlatformStorageStatusLine } from '@/lib/platform-storage-display';

const active = {
  phase: 'active' as const,
  availableBytes: 6000,
  maxBufferBytes: 6000,
  storedBytes: 1200,
};

describe('formatPlatformStorageStatusLine', () => {
  it('uses the wallet promise for loading, errors, and inactive', () => {
    expect(
      formatPlatformStorageStatusLine({
        loading: true,
        error: null,
        summary: null,
      })
    ).toBe('Checking storage…');
    expect(
      formatPlatformStorageStatusLine({
        loading: false,
        error: 'gateway down',
        summary: null,
      })
    ).toBe('Unavailable right now');
    expect(
      formatPlatformStorageStatusLine({
        loading: false,
        error: null,
        summary: { ...active, phase: 'inactive' },
      })
    ).toBe('Activates on your first save');
  });

  it('repeats the free and covered line for an active buffer', () => {
    expect(
      formatPlatformStorageStatusLine({
        loading: false,
        error: null,
        summary: active,
      })
    ).toBe('6/6 KB free · 1.2 KB covered');
  });
});
