import { describe, expect, it } from 'vitest';
import {
  EMPTY_POST_ENGAGEMENT,
  mergeEngagementSoftUpgrade,
  type PostEngagement,
} from '@/hooks/use-post-engagement';

function row(over: Partial<PostEngagement> = {}): PostEngagement {
  return { ...EMPTY_POST_ENGAGEMENT, ...over };
}

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
});
