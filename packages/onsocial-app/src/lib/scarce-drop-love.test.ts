import { describe, expect, it } from 'vitest';
import {
  dropFanCount,
  dropFanCountMatchingRoster,
  nextDropFanCountAfterToggle,
} from '@/lib/scarce-drop-love';

describe('drop fan count', () => {
  it('keeps a creator love off the fan count', () => {
    expect(
      dropFanCount({
        indexedFanCount: 0,
        reactionCount: 1,
        creatorLoved: true,
      })
    ).toBe(0);
    expect(
      dropFanCount({
        indexedFanCount: null,
        reactionCount: 1,
        creatorLoved: true,
      })
    ).toBe(0);
  });

  it('counts other people when the indexed read is missing', () => {
    expect(
      dropFanCount({
        indexedFanCount: null,
        reactionCount: 2,
        creatorLoved: false,
      })
    ).toBe(2);
  });

  it('uses the indexed count, which already leaves the creator out', () => {
    expect(
      dropFanCount({
        indexedFanCount: 3,
        reactionCount: 4,
        creatorLoved: true,
      })
    ).toBe(3);
  });

  it('does not add the creator when they toggle', () => {
    const base = dropFanCount({
      indexedFanCount: 0,
      reactionCount: 1,
      creatorLoved: true,
    });
    expect(
      nextDropFanCountAfterToggle({
        fanCount: base,
        creatorId: 'ada.near',
        viewerId: 'ada.near',
        apiLoved: false,
        nextLoved: true,
      })
    ).toBe(0);
  });

  it('matches an empty roster to no fans', () => {
    expect(dropFanCountMatchingRoster({ fanCount: 1, fanIds: [] })).toBe(0);
    expect(
      dropFanCountMatchingRoster({ fanCount: 1, fanIds: ['bo.near'] })
    ).toBe(1);
  });
});
