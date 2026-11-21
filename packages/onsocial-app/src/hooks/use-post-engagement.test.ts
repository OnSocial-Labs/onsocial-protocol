import { describe, expect, it } from 'vitest';
import {
  applyViewerOverlayEngagement,
  confirmedAmplifyEngagement,
  confirmedReactionEngagement,
  EMPTY_POST_ENGAGEMENT,
  engagementForAccountChange,
  mergeEngagementSoftUpgrade,
  pendingReactionEngagement,
  pruneEngagementMap,
  reactionCountAfterToggle,
  rememberEngagementLastGood,
  resolveBandEngagement,
  partitionOverlayAmplifyPaths,
  shouldApplyAmplifyCountFill,
  shouldApplyViewerToggleConfirm,
  type PostEngagement,
} from '@/hooks/use-post-engagement';

function row(over: Partial<PostEngagement> = {}): PostEngagement {
  return {
    ...EMPTY_POST_ENGAGEMENT,
    viewerFlagsReady: true,
    amplifyCountReady: true,
    ...over,
  };
}

describe('shouldApplyViewerToggleConfirm', () => {
  it('applies confirm only while the same wallet is still active', () => {
    expect(shouldApplyViewerToggleConfirm('alice.near', 'alice.near')).toBe(
      true
    );
    expect(shouldApplyViewerToggleConfirm('bob.near', 'alice.near')).toBe(
      false
    );
    expect(shouldApplyViewerToggleConfirm(null, 'alice.near')).toBe(false);
  });
});

describe('amplify confirm / soft-fill account guard', () => {
  it('skips amplify confirm when the signer is no longer the active wallet', () => {
    expect(shouldApplyViewerToggleConfirm('bob.near', 'alice.near')).toBe(
      false
    );
    expect(shouldApplyViewerToggleConfirm('alice.near', 'alice.near')).toBe(
      true
    );
  });

  it('bumps amplify count and colour only via confirmedAmplifyEngagement', () => {
    const first = confirmedAmplifyEngagement(
      row({ viewerAmplified: false, amplifyCount: 2 })
    );
    expect(first).toMatchObject({
      viewerAmplified: true,
      amplifyCount: 3,
      amplifyCountReady: true,
      amplifyRoll: 1,
    });
    const again = confirmedAmplifyEngagement(first);
    expect(again.amplifyCount).toBe(4);
    expect(again.viewerAmplified).toBe(true);
    expect(again.amplifyRoll).toBe(2);
  });

  it('skips soft-fill when the wallet changed while counts were loading', () => {
    expect(shouldApplyAmplifyCountFill('bob.near', 'alice.near')).toBe(false);
    expect(shouldApplyAmplifyCountFill(null, 'alice.near')).toBe(false);
    expect(shouldApplyAmplifyCountFill('alice.near', 'alice.near')).toBe(true);
    expect(shouldApplyAmplifyCountFill(null, null)).toBe(true);
  });

  it('partitions overlay amplify into count paths vs colour-only paths', () => {
    const split = partitionOverlayAmplifyPaths(
      [
        { key: 'a:1', path: 'a.near/post/1' },
        { key: 'b:2', path: 'b.near/post/2' },
        { key: 'c:3', path: 'c.near/post/3' },
      ],
      {
        'a:1': row({ amplifyCountReady: true }),
        'b:2': row({ amplifyCountReady: false }),
        // c missing — needs counts
      }
    );
    expect(split.countPaths).toEqual(['b.near/post/2', 'c.near/post/3']);
    expect(split.colourPaths).toEqual(['a.near/post/1']);
  });
});

describe('like confirm / rollback', () => {
  it('holds the count on pending and rolls only on confirm', () => {
    const previous = row({ viewerReacted: false, reactionCount: 3 });
    const pending = pendingReactionEngagement(previous, true);
    expect(pending.viewerReacted).toBe(true);
    expect(pending.reactionCount).toBe(3);
    const confirmed = confirmedReactionEngagement(previous, true);
    expect(confirmed.reactionCount).toBe(4);
    expect(confirmed.reactionRoll).toBe(1);
  });

  it('rolls back to the pre-toggle row on reject (same shape as catch)', () => {
    const previous = row({ viewerReacted: false, reactionCount: 3 });
    const pending = pendingReactionEngagement(previous, true);
    const rolledBack = previous;
    expect(pending.viewerReacted).toBe(true);
    expect(rolledBack).toEqual(previous);
    expect(rolledBack.reactionCount).toBe(3);
  });
});

describe('engagementForAccountChange', () => {
  it('clears the previous viewer colour and rolls on switch', () => {
    const stripped = engagementForAccountChange(
      {
        'a:1': row({
          viewerReacted: true,
          viewerSaved: true,
          viewerAmplified: true,
          viewerReposted: true,
          viewerRepostId: 'r1',
          reactionCount: 4,
          reactionRoll: 2,
          saveRoll: 1,
          viewerFlagsReady: true,
        }),
      },
      'bob.near'
    );
    expect(stripped['a:1']).toMatchObject({
      viewerReacted: false,
      viewerSaved: false,
      viewerAmplified: false,
      viewerReposted: false,
      viewerRepostId: null,
      reactionCount: 4,
      reactionRoll: 0,
      saveRoll: 0,
      viewerFlagsReady: false,
    });
  });

  it('marks colour ready when signed out so hearts stay tappable', () => {
    const stripped = engagementForAccountChange(
      { 'a:1': row({ viewerReacted: true, viewerFlagsReady: true }) },
      null
    );
    expect(stripped['a:1']?.viewerReacted).toBe(false);
    expect(stripped['a:1']?.viewerFlagsReady).toBe(true);
  });
});

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
      { [key]: row({ viewerSaved: true, saveRoll: 1, replyCount: 1 }) },
      { [key]: row({ viewerSaved: false, replyCount: 2 }) },
      new Set(),
      new Set()
    );
    expect(merged[key]?.viewerSaved).toBe(true);
    expect(merged[key]?.replyCount).toBe(2);
  });

  it('preserves confirmed unsave when soft-fill still shows saved', () => {
    const key = 'alice.near:p1';
    const merged = mergeEngagementSoftUpgrade(
      { [key]: row({ viewerSaved: false, saveRoll: 1, replyCount: 1 }) },
      { [key]: row({ viewerSaved: true, replyCount: 2 }) },
      new Set(),
      new Set()
    );
    expect(merged[key]?.viewerSaved).toBe(false);
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

  it('lands amplify colour with the public total in the same apply', () => {
    const next = applyViewerOverlayEngagement(
      row({ amplifyCountReady: false, amplifyCount: 0 }),
      {
        viewerReacted: false,
        viewerSaved: false,
        viewerAmplified: true,
        viewerReposted: false,
        viewerRepostId: null,
        viewerRepostGroupId: null,
        amplifyCount: 3,
      },
      { pendingReaction: false, pendingSave: false, unreposted: false }
    );
    expect(next.viewerAmplified).toBe(true);
    expect(next.amplifyCount).toBe(3);
    expect(next.amplifyCountReady).toBe(true);
  });

  it('never settles an active amplify on a zero total', () => {
    const next = applyViewerOverlayEngagement(
      row({ amplifyCountReady: true, amplifyCount: 0 }),
      {
        viewerReacted: false,
        viewerSaved: false,
        viewerAmplified: true,
        viewerReposted: false,
        viewerRepostId: null,
        viewerRepostGroupId: null,
        amplifyCount: 0,
      },
      { pendingReaction: false, pendingSave: false, unreposted: false }
    );
    expect(next.amplifyCount).toBe(1);
    expect(next.amplifyCountReady).toBe(true);
  });

  it('holds confirmed unsave when overlay still lists the bookmark', () => {
    const next = applyViewerOverlayEngagement(
      row({ viewerSaved: false, saveRoll: 1 }),
      {
        viewerReacted: false,
        viewerSaved: true,
        viewerAmplified: false,
        viewerReposted: false,
        viewerRepostId: null,
        viewerRepostGroupId: null,
      },
      { pendingReaction: false, pendingSave: false, unreposted: false }
    );
    expect(next.viewerSaved).toBe(false);
  });
});
