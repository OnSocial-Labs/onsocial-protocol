import { describe, expect, it } from 'vitest';
import {
  applyViewerOverlayEngagement,
  confirmedReactionEngagement,
  EMPTY_POST_ENGAGEMENT,
  mergeEngagementSoftUpgrade,
  pendingReactionEngagement,
  pruneEngagementMap,
  reactionCountAfterToggle,
  rememberEngagementLastGood,
  resolveBandEngagement,
  type PostEngagement,
} from '@/hooks/use-post-engagement';

function row(over: Partial<PostEngagement> = {}): PostEngagement {
  return { ...EMPTY_POST_ENGAGEMENT, ...over };
}

describe('pruneEngagementMap', () => {
  it('drops keys that left the retain set and keeps identity when unchanged', () => {
    const current = {
      'a:1': row({ reactionCount: 1 }),
      'b:2': row({ reactionCount: 2 }),
    };
    const pruned = pruneEngagementMap(current, new Set(['a:1']));
    expect(Object.keys(pruned)).toEqual(['a:1']);
    expect(pruneEngagementMap(pruned, new Set(['a:1']))).toBe(pruned);
  });

  it('keeps off-band keys when retain is the full feed list', () => {
    const current = {
      'a:1': row({ reactionCount: 1 }),
      'b:2': row({ reactionCount: 2 }),
      'c:3': row({ reactionCount: 3 }),
    };
    expect(
      Object.keys(
        pruneEngagementMap(current, new Set(['a:1', 'b:2', 'c:3']))
      ).sort()
    ).toEqual(['a:1', 'b:2', 'c:3']);
  });
});

describe('resolveBandEngagement', () => {
  it('fills pruned keys from seed + last-good in one resolve', () => {
    const lastGood = new Map<string, PostEngagement>();
    rememberEngagementLastGood(
      lastGood,
      'a:1',
      row({
        viewerReacted: true,
        viewerAmplified: true,
        reactionCount: 5,
        replyCount: 2,
      })
    );
    const painted = resolveBandEngagement({
      live: {},
      seed: { 'a:1': row({ reactionCount: 4, replyCount: 2 }) },
      lastGood,
      keys: ['a:1'],
    });
    expect(painted['a:1']?.viewerReacted).toBe(true);
    expect(painted['a:1']?.viewerAmplified).toBe(true);
    expect(painted['a:1']?.reactionCount).toBe(5);
    expect(painted['a:1']?.replyCount).toBe(2);
  });

  it('keeps live identity when last-good adds nothing', () => {
    const live = { 'a:1': row({ reactionCount: 3, viewerReacted: true }) };
    const painted = resolveBandEngagement({
      live,
      seed: null,
      lastGood: new Map(),
      keys: ['a:1'],
    });
    expect(painted).toBe(live);
  });

  it('uses last-good alone when the seed was trimmed', () => {
    const lastGood = new Map<string, PostEngagement>();
    rememberEngagementLastGood(
      lastGood,
      'a:1',
      row({ viewerReacted: true, reactionCount: 9 })
    );
    const painted = resolveBandEngagement({
      live: {},
      seed: null,
      lastGood,
      keys: ['a:1'],
    });
    expect(painted['a:1']?.viewerReacted).toBe(true);
    expect(painted['a:1']?.reactionCount).toBe(9);
  });
});

describe('reaction confirmation', () => {
  it('fills the heart and holds the count until the like confirms', () => {
    const previous = row({ viewerReacted: false, reactionCount: 3 });
    expect(pendingReactionEngagement(previous, true)).toEqual(
      row({ viewerReacted: true, reactionCount: 3 })
    );
    expect(confirmedReactionEngagement(previous, true)).toEqual(
      row({ viewerReacted: true, reactionCount: 4, reactionRoll: 1 })
    );
  });

  it('holds the count until an unlike confirms', () => {
    const previous = row({ viewerReacted: true, reactionCount: 4 });
    expect(pendingReactionEngagement(previous, false)).toEqual(
      row({ viewerReacted: false, reactionCount: 4 })
    );
    expect(confirmedReactionEngagement(previous, false)).toEqual(
      row({ viewerReacted: false, reactionCount: 3, reactionRoll: 1 })
    );
  });

  it('rolls the local total once the chain confirms', () => {
    expect(reactionCountAfterToggle(3, true)).toBe(4);
    expect(reactionCountAfterToggle(4, false)).toBe(3);
    expect(reactionCountAfterToggle(0, false)).toBe(0);
  });
});

describe('mergeEngagementSoftUpgrade', () => {
  it('keeps pending reaction optimism over fetched counts', () => {
    const key = 'alice.near:p1';
    const merged = mergeEngagementSoftUpgrade(
      {
        [key]: row({
          viewerReacted: true,
          reactionCount: 4,
          replyCount: 1,
        }),
      },
      {
        [key]: row({
          viewerReacted: false,
          reactionCount: 3,
          replyCount: 2,
        }),
      },
      new Set([key]),
      new Set()
    );
    expect(merged[key]).toEqual(
      row({
        viewerReacted: true,
        reactionCount: 4,
        replyCount: 2,
      })
    );
  });

  it('keeps pending save optimism', () => {
    const key = 'alice.near:p1';
    const merged = mergeEngagementSoftUpgrade(
      { [key]: row({ viewerSaved: true, replyCount: 1 }) },
      { [key]: row({ viewerSaved: false, replyCount: 2 }) },
      new Set(),
      new Set([key])
    );
    expect(merged[key]?.viewerSaved).toBe(true);
    expect(merged[key]?.replyCount).toBe(2);
  });

  it('preserves confirmed amplify until indexer catches up', () => {
    const key = 'alice.near:p1';
    const merged = mergeEngagementSoftUpgrade(
      { [key]: row({ viewerAmplified: true, amplifyCount: 5 }) },
      { [key]: row({ viewerAmplified: false, amplifyCount: 4 }) },
      new Set(),
      new Set()
    );
    expect(merged[key]?.viewerAmplified).toBe(true);
    expect(merged[key]?.amplifyCount).toBe(5);
  });

  it('keeps chain-confirmed like when soft-fill lags on viewer flag', () => {
    const key = 'alice.near:p1';
    const merged = mergeEngagementSoftUpgrade(
      {
        [key]: row({
          viewerReacted: true,
          reactionCount: 5,
          reactionRoll: 1,
        }),
      },
      { [key]: row({ viewerReacted: false, reactionCount: 4 }) },
      new Set(),
      new Set()
    );
    expect(merged[key]?.viewerReacted).toBe(true);
    expect(merged[key]?.reactionCount).toBe(5);
  });

  it('keeps chain-confirmed unlike when soft-fill still shows liked', () => {
    const key = 'alice.near:p1';
    const merged = mergeEngagementSoftUpgrade(
      {
        [key]: row({
          viewerReacted: false,
          reactionCount: 4,
          reactionRoll: 1,
        }),
      },
      { [key]: row({ viewerReacted: true, reactionCount: 5 }) },
      new Set(),
      new Set()
    );
    expect(merged[key]?.viewerReacted).toBe(false);
    expect(merged[key]?.reactionCount).toBe(4);
  });

  it('does not dip a confirmed like total when soft-fill returns a lower count', () => {
    const key = 'alice.near:p1';
    const merged = mergeEngagementSoftUpgrade(
      {
        [key]: row({
          viewerReacted: true,
          reactionCount: 5,
          reactionRoll: 1,
        }),
      },
      { [key]: row({ viewerReacted: true, reactionCount: 4 }) },
      new Set(),
      new Set()
    );
    expect(merged[key]?.reactionCount).toBe(5);
  });

  it('still applies first viewer colour when reactionRoll is zero', () => {
    const key = 'alice.near:p1';
    const merged = mergeEngagementSoftUpgrade(
      { [key]: row({ viewerReacted: false, reactionCount: 4 }) },
      { [key]: row({ viewerReacted: true, reactionCount: 4 }) },
      new Set(),
      new Set()
    );
    expect(merged[key]?.viewerReacted).toBe(true);
  });

  it('keeps a confirm roll when a later read changes the count', () => {
    const key = 'alice.near:p1';
    const merged = mergeEngagementSoftUpgrade(
      { [key]: row({ reactionCount: 4, reactionRoll: 1, amplifyRoll: 2 }) },
      { [key]: row({ reactionCount: 9, amplifyCount: 1 }) },
      new Set(),
      new Set()
    );
    expect(merged[key]?.reactionCount).toBe(9);
    expect(merged[key]?.reactionRoll).toBe(1);
    expect(merged[key]?.amplifyRoll).toBe(2);
  });

  it('keeps a confirmed quote count until the indexer catches up', () => {
    const key = 'alice.near:p1';
    const merged = mergeEngagementSoftUpgrade(
      { [key]: row({ quoteCount: 3, shareRoll: 1 }) },
      { [key]: row({ quoteCount: 2 }) },
      new Set(),
      new Set()
    );
    expect(merged[key]?.quoteCount).toBe(3);
    expect(merged[key]?.shareRoll).toBe(1);
  });

  it('preserves confirmed save until indexer catches up', () => {
    const key = 'alice.near:p1';
    const merged = mergeEngagementSoftUpgrade(
      { [key]: row({ viewerSaved: true, replyCount: 1 }) },
      { [key]: row({ viewerSaved: false, replyCount: 2 }) },
      new Set(),
      new Set()
    );
    expect(merged[key]?.viewerSaved).toBe(true);
    expect(merged[key]?.replyCount).toBe(2);
  });

  it('keeps a confirmed unrepost while the indexer still lists it', () => {
    const key = 'alice.near:p1';
    const merged = mergeEngagementSoftUpgrade(
      {
        [key]: row({
          viewerReposted: false,
          viewerRepostId: null,
          repostCount: 2,
        }),
      },
      {
        [key]: row({
          viewerReposted: true,
          viewerRepostId: 'r1',
          repostCount: 3,
        }),
      },
      new Set(),
      new Set(),
      new Set([key])
    );
    expect(merged[key]?.viewerReposted).toBe(false);
    expect(merged[key]?.viewerRepostId).toBeNull();
    expect(merged[key]?.repostCount).toBe(2);
  });

  it('keeps a confirmed repost until the indexer catches up', () => {
    const key = 'alice.near:p1';
    const merged = mergeEngagementSoftUpgrade(
      {
        [key]: row({
          viewerReposted: true,
          viewerRepostId: 'r1',
          repostCount: 3,
        }),
      },
      {
        [key]: row({
          viewerReposted: false,
          viewerRepostId: null,
          repostCount: 2,
        }),
      },
      new Set(),
      new Set()
    );
    expect(merged[key]?.viewerReposted).toBe(true);
    expect(merged[key]?.viewerRepostId).toBe('r1');
    expect(merged[key]?.repostCount).toBe(3);
  });

  it('applies fetched state when nothing is pending', () => {
    const key = 'alice.near:p1';
    const fetched = row({
      viewerReacted: true,
      reactionCount: 9,
      viewerSaved: true,
    });
    const merged = mergeEngagementSoftUpgrade(
      { [key]: row() },
      { [key]: fetched },
      new Set(),
      new Set()
    );
    expect(merged[key]).toEqual(fetched);
  });

  it('keeps known viewer colour when a public-count seed lacks flags', () => {
    const key = 'alice.near:p1';
    const merged = mergeEngagementSoftUpgrade(
      {
        [key]: row({
          viewerReacted: true,
          viewerSaved: true,
          viewerFlagsReady: true,
          reactionCount: 4,
        }),
      },
      {
        [key]: row({
          viewerReacted: false,
          viewerSaved: false,
          viewerFlagsReady: false,
          reactionCount: 4,
          amplifyCountReady: false,
        }),
      },
      new Set(),
      new Set()
    );
    expect(merged[key]?.viewerReacted).toBe(true);
    expect(merged[key]?.viewerSaved).toBe(true);
    expect(merged[key]?.viewerFlagsReady).toBe(true);
  });

  it('keeps a known amplify total when seed omits the column', () => {
    const key = 'alice.near:p1';
    const merged = mergeEngagementSoftUpgrade(
      {
        [key]: row({
          amplifyCount: 7,
          amplifyCountReady: true,
        }),
      },
      {
        [key]: row({
          amplifyCount: 0,
          amplifyCountReady: false,
        }),
      },
      new Set(),
      new Set()
    );
    expect(merged[key]?.amplifyCount).toBe(7);
    expect(merged[key]?.amplifyCountReady).toBe(true);
  });
});

describe('applyViewerOverlayEngagement', () => {
  it('does not undo an in-flight like when the overlay is stale', () => {
    const next = applyViewerOverlayEngagement(
      row({ viewerReacted: true, reactionCount: 4 }),
      {
        viewerReacted: false,
        viewerSaved: false,
        viewerAmplified: false,
        viewerReposted: false,
        viewerRepostId: null,
        viewerRepostGroupId: null,
      },
      { pendingReaction: true, pendingSave: false, unreposted: false }
    );
    expect(next.viewerReacted).toBe(true);
    expect(next.viewerFlagsReady).toBe(true);
  });

  it('holds chain-confirmed colour when overlay still lags', () => {
    const next = applyViewerOverlayEngagement(
      row({
        viewerReacted: true,
        reactionCount: 5,
        reactionRoll: 1,
      }),
      {
        viewerReacted: false,
        viewerSaved: false,
        viewerAmplified: false,
        viewerReposted: false,
        viewerRepostId: null,
        viewerRepostGroupId: null,
      },
      { pendingReaction: false, pendingSave: false, unreposted: false }
    );
    expect(next.viewerReacted).toBe(true);
  });

  it('applies first colour when nothing is pending', () => {
    const next = applyViewerOverlayEngagement(
      row({ viewerReacted: false, viewerFlagsReady: false }),
      {
        viewerReacted: true,
        viewerSaved: true,
        viewerAmplified: false,
        viewerReposted: false,
        viewerRepostId: null,
        viewerRepostGroupId: null,
      },
      { pendingReaction: false, pendingSave: false, unreposted: false }
    );
    expect(next.viewerReacted).toBe(true);
    expect(next.viewerSaved).toBe(true);
    expect(next.viewerFlagsReady).toBe(true);
  });
});
