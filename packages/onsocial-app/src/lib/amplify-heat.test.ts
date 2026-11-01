import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  AMPLIFY_HEAT_EPSILON,
  effectiveAmplifyHeat,
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

describe('effectiveAmplifyHeat', () => {
  it('zeros heat below epsilon', () => {
    expect(effectiveAmplifyHeat(AMPLIFY_HEAT_EPSILON - 1e-6)).toBe(0);
    expect(effectiveAmplifyHeat(0.009)).toBe(0);
    expect(effectiveAmplifyHeat(null)).toBe(0);
    expect(effectiveAmplifyHeat(undefined)).toBe(0);
  });

  it('keeps heat at or above epsilon', () => {
    expect(effectiveAmplifyHeat(AMPLIFY_HEAT_EPSILON)).toBe(
      AMPLIFY_HEAT_EPSILON
    );
    expect(effectiveAmplifyHeat(1.5)).toBe(1.5);
  });
});

describe('sortPostsByHot', () => {
  it('orders by heat then block height', () => {
    const posts = [
      row('a.near', '1', { heat: 0, blockHeight: 10 }),
      row('b.near', '2', { heat: 2, blockHeight: 5 }),
      row('c.near', '3', { heat: 2, blockHeight: 9 }),
    ];
    expect(sortPostsByHot(posts).map((p) => p.postId)).toEqual(['3', '2', '1']);
  });

  it('treats sub-epsilon residual heat as zero so cold posts can win on blockHeight', () => {
    const posts = [
      row('old.near', 'residual', { heat: 0.005, blockHeight: 10 }),
      row('new.near', 'cold', { heat: 0, blockHeight: 100 }),
      row('hot.near', 'hot', { heat: 2, blockHeight: 5 }),
    ];
    expect(sortPostsByHot(posts).map((p) => p.postId)).toEqual([
      'hot',
      'cold',
      'residual',
    ]);
  });
});
