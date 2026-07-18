import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  applyOptimisticAmplifyHeat,
  mergeAmplifyHeatFloors,
  optimisticAmplifyHeatDelta,
  sortPostsByHot,
} from '@/lib/amplify-heat';

function row(
  accountId: string,
  postId: string,
  opts: { heat?: number; blockHeight?: number } = {}
): PostRow {
  return {
    accountId,
    postId,
    value: '{}',
    blockHeight: opts.blockHeight ?? 1,
    blockTimestamp: 0,
    amplifyHeat: opts.heat ?? 0,
  };
}

describe('optimisticAmplifyHeatDelta', () => {
  it('uses log2(1+S) for a first non-self amplify', () => {
    const oneSocial = 10n ** 18n;
    expect(
      optimisticAmplifyHeatDelta({ amountYocto: oneSocial, isSelf: false })
    ).toBeCloseTo(1, 5);
  });

  it('dampens repeats and self amplifies', () => {
    const oneSocial = 10n ** 18n;
    const first = optimisticAmplifyHeatDelta({
      amountYocto: oneSocial,
      isSelf: false,
    });
    const repeat = optimisticAmplifyHeatDelta({
      amountYocto: oneSocial,
      isSelf: false,
      isRepeatFromViewer: true,
    });
    const self = optimisticAmplifyHeatDelta({
      amountYocto: oneSocial,
      isSelf: true,
    });
    expect(repeat).toBeCloseTo(first * 0.25, 5);
    expect(self).toBeCloseTo(first * 0.25, 5);
  });
});

describe('sortPostsByHot / applyOptimisticAmplifyHeat', () => {
  it('orders by heat then block height', () => {
    const posts = [
      row('a.near', '1', { heat: 0, blockHeight: 10 }),
      row('b.near', '2', { heat: 2, blockHeight: 5 }),
      row('c.near', '3', { heat: 2, blockHeight: 9 }),
    ];
    expect(sortPostsByHot(posts).map((p) => p.postId)).toEqual(['3', '2', '1']);
  });

  it('bumps heat and lifts the amplified post', () => {
    const target = row('a.near', '1', { heat: 0.1, blockHeight: 1 });
    const posts = [row('b.near', '2', { heat: 0.5, blockHeight: 2 }), target];
    const next = applyOptimisticAmplifyHeat(posts, target, {
      amountYocto: 10n ** 18n,
      isSelf: false,
    });
    expect(next[0]?.postId).toBe('1');
    expect(next[0]?.amplifyHeat).toBeCloseTo(1.1, 5);
  });

  it('preserves heat floors until indexer catches up', () => {
    const posts = [row('a.near', '1', { heat: 0.2, blockHeight: 1 })];
    const floors = new Map([
      ['a.near:1', { heat: 1.2, untilMs: Date.now() + 10_000 }],
    ]);
    const merged = mergeAmplifyHeatFloors(posts, floors);
    expect(merged[0]?.amplifyHeat).toBeCloseTo(1.2, 5);
  });
});
