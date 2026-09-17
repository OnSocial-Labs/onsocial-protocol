import { describe, expect, it } from 'vitest';
import {
  dedupeLikeAccountIds,
  mergeViewerIntoLikeAccountIds,
  postLikeReactionPathSuffix,
} from '@/lib/load-post-like-account-ids';

describe('postLikeReactionPathSuffix', () => {
  it('builds a personal post suffix', () => {
    expect(postLikeReactionPathSuffix('p1')).toBe('/post/p1');
  });

  it('builds a guild post suffix', () => {
    expect(postLikeReactionPathSuffix('r1', 'dao')).toBe(
      '/groups/dao/content/post/r1'
    );
  });
});

describe('dedupeLikeAccountIds', () => {
  it('keeps first (newest) occurrence', () => {
    expect(
      dedupeLikeAccountIds([
        { accountId: 'a.near' },
        { accountId: 'b.near' },
        { accountId: 'a.near' },
      ])
    ).toEqual(['a.near', 'b.near']);
  });
});

describe('mergeViewerIntoLikeAccountIds', () => {
  it('prepends the viewer when liked and missing', () => {
    expect(
      mergeViewerIntoLikeAccountIds(['a.near'], 'me.near', true)
    ).toEqual(['me.near', 'a.near']);
  });

  it('does not duplicate an existing viewer', () => {
    expect(
      mergeViewerIntoLikeAccountIds(['me.near', 'a.near'], 'me.near', true)
    ).toEqual(['me.near', 'a.near']);
  });

  it('skips when the viewer has not liked', () => {
    expect(
      mergeViewerIntoLikeAccountIds(['a.near'], 'me.near', false)
    ).toEqual(['a.near']);
  });
});
