import { describe, expect, it, vi } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  collectResolvedSavePage,
  countVisibleHomeFeedCards,
  fillVisibleFeedPage,
  homeFeedIncludeForeignReplies,
  homeFeedShowsTimelineChrome,
} from '@/features/home/home-feed-visible';

function post(
  accountId: string,
  postId: string,
  extra: Partial<PostRow> = {}
): PostRow {
  return {
    accountId,
    postId,
    value: JSON.stringify({ text: postId }),
    blockHeight: 1,
    blockTimestamp: 1,
    groupId: 'dao',
    ...extra,
  };
}

function foreignReply(postId: string): PostRow {
  return post('alice.near', postId, {
    parentPath: 'bob.near/post/root',
    parentAuthor: 'bob.near',
  });
}

describe('home feed chrome ownership', () => {
  it('paints replies on Saved bookmarks and on any focused slice', () => {
    expect(homeFeedIncludeForeignReplies('saved', false)).toBe(true);
    expect(homeFeedIncludeForeignReplies('global', true)).toBe(true);
    expect(homeFeedIncludeForeignReplies('pulse', true)).toBe(true);
    expect(homeFeedIncludeForeignReplies('global', false)).toBe(false);
    expect(homeFeedIncludeForeignReplies('pulse', false)).toBe(false);
  });

  it('keeps Hot/Recent on a topic opened from Saved', () => {
    expect(homeFeedShowsTimelineChrome('saved', false)).toBe(false);
    expect(homeFeedShowsTimelineChrome('saved', true)).toBe(true);
    expect(homeFeedShowsTimelineChrome('pulse', false)).toBe(true);
    expect(homeFeedShowsTimelineChrome('global', false)).toBe(true);
  });
});

describe('countVisibleHomeFeedCards', () => {
  it('drops a page that is only replies to other people', () => {
    expect(
      countVisibleHomeFeedCards([foreignReply('r1'), foreignReply('r2')])
    ).toBe(0);
  });

  it('keeps a bookmarked reply when foreign replies are included', () => {
    expect(
      countVisibleHomeFeedCards([foreignReply('r1')], {
        includeForeignReplies: true,
      })
    ).toBe(1);
  });
});

describe('fillVisibleFeedPage', () => {
  it('walks a reply-only window and returns the next roots', async () => {
    const fetchPage = vi.fn(async (offset: number) => {
      if (offset === 0) {
        return {
          items: [foreignReply('r1'), foreignReply('r2')],
          nextOffset: 2,
        };
      }
      return {
        items: [post('cara.near', 'root')],
        nextOffset: undefined,
      };
    });

    const page = await fillVisibleFeedPage({
      offset: 0,
      limit: 2,
      fetchPage,
      visibleCount: (posts) => countVisibleHomeFeedCards(posts),
    });

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(page.items.map((row) => row.postId)).toEqual(['r1', 'r2', 'root']);
    expect(page.nextOffset).toBeUndefined();
    expect(countVisibleHomeFeedCards(page.items)).toBe(1);
  });

  it('stops when the visible page is full', async () => {
    const fetchPage = vi.fn(async () => ({
      items: [post('a.near', '1'), post('b.near', '2')],
      nextOffset: 2,
    }));

    const page = await fillVisibleFeedPage({
      offset: 0,
      limit: 2,
      fetchPage,
      visibleCount: (posts) => countVisibleHomeFeedCards(posts),
    });

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(page.nextOffset).toBe(2);
  });
});

describe('collectResolvedSavePage', () => {
  it('skips missing bookmarks and fills the page from later saves', async () => {
    const loadRefs = vi.fn(async (offset: number, limit: number) => {
      if (offset === 0) return Array.from({ length: limit }, () => null);
      return [{ author: 'alice.near', postId: 'kept' }];
    });
    const hydrate = vi.fn(async () => {
      const map = new Map<string, PostRow>();
      map.set('alice.near\0kept', post('alice.near', 'kept'));
      return map;
    });

    const page = await collectResolvedSavePage({
      offset: 0,
      limit: 2,
      loadRefs,
      hydrate,
      refKey: (ref) => `${ref.author}\0${ref.postId}`,
    });

    expect(loadRefs).toHaveBeenCalledTimes(2);
    expect(page.items.map((row) => row.postId)).toEqual(['kept']);
    expect(page.nextOffset).toBeUndefined();
  });

  it('keeps a cursor when a full save page does not resolve', async () => {
    const loadRefs = vi.fn(async () => [null, null]);

    const page = await collectResolvedSavePage({
      offset: 0,
      limit: 2,
      maxPages: 1,
      loadRefs,
      hydrate: async () => new Map(),
      refKey: (ref) => `${ref.author}\0${ref.postId}`,
    });

    expect(page.items).toEqual([]);
    expect(page.nextOffset).toBe(2);
  });
});
