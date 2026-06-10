import { describe, expect, it } from 'vitest';

import { resolveSeasonDistributablePool } from '../../src/services/seasons/season-finalization.js';

describe('resolveSeasonDistributablePool', () => {
  it('uses indexed pool when it is within on-chain balance', () => {
    expect(
      resolveSeasonDistributablePool('1000', '1500', { requireNonEmpty: false })
    ).toEqual({
      indexedPoolYocto: '1000',
      onChainPoolYocto: '1500',
      distributablePoolYocto: '1000',
    });
  });

  it('clamps to on-chain pool when indexer over-counts', () => {
    expect(
      resolveSeasonDistributablePool('1500', '1000', { requireNonEmpty: false })
    ).toEqual({
      indexedPoolYocto: '1500',
      onChainPoolYocto: '1000',
      distributablePoolYocto: '1000',
    });
  });

  it('rejects empty distributable pools when required', () => {
    expect(() =>
      resolveSeasonDistributablePool('0', '0', { requireNonEmpty: true })
    ).toThrow('Season pool is empty on-chain; nothing can be settled');
  });
});
