import { describe, expect, it } from 'vitest';
import {
  isScarceCollectionSavePath,
  parseScarceCollectionSavePath,
  scarceCollectionContentPath,
} from '@/lib/scarce-save-content-path';

describe('scarceCollectionContentPath', () => {
  it('builds a scarce/collection path', () => {
    expect(scarceCollectionContentPath('night-drive-abc')).toBe(
      'scarce/collection/night-drive-abc'
    );
  });

  it('trims whitespace', () => {
    expect(scarceCollectionContentPath('  drop-1  ')).toBe(
      'scarce/collection/drop-1'
    );
  });

  it('rejects empty ids', () => {
    expect(() => scarceCollectionContentPath('')).toThrow();
    expect(() => scarceCollectionContentPath('   ')).toThrow();
  });
});

describe('parseScarceCollectionSavePath', () => {
  it('parses collection saves', () => {
    expect(
      parseScarceCollectionSavePath('scarce/collection/night-drive-abc')
    ).toBe('night-drive-abc');
  });

  it('returns null for post saves and track love paths', () => {
    expect(parseScarceCollectionSavePath('alice.near/post/1')).toBeNull();
    expect(
      parseScarceCollectionSavePath('scarce/night-drive/track/bafk1')
    ).toBeNull();
    expect(parseScarceCollectionSavePath('scarce/collection/')).toBeNull();
  });

  it('isScarceCollectionSavePath matches parse', () => {
    expect(isScarceCollectionSavePath('scarce/collection/x')).toBe(true);
    expect(isScarceCollectionSavePath('alice.near/post/1')).toBe(false);
  });
});
