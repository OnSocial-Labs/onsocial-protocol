import { describe, expect, it } from 'vitest';
import {
  homeSavedFeedFocus,
  homeSavedFeedLabel,
  removeHomeSavedFeedFromList,
  upsertHomeSavedFeedList,
  type HomeSavedFeed,
} from '@/features/home/home-saved-feeds';

describe('home-saved-feeds', () => {
  it('labels hashtag and ticker feeds', () => {
    expect(
      homeSavedFeedLabel({
        id: '1',
        kind: 'hashtag',
        value: 'near',
        createdAt: 1,
      })
    ).toBe('#near');
    expect(
      homeSavedFeedLabel({
        id: '2',
        kind: 'ticker',
        value: 'social',
        createdAt: 1,
      })
    ).toBe('$SOCIAL');
  });

  it('upserts by focus key and moves existing to front', () => {
    const initial: HomeSavedFeed[] = [
      { id: 'a', kind: 'hashtag', value: 'near', createdAt: 1 },
      { id: 'b', kind: 'ticker', value: 'social', createdAt: 2 },
    ];
    const next = upsertHomeSavedFeedList(initial, {
      kind: 'hashtag',
      value: 'near',
    });
    expect(next.map((feed) => feed.id)).toEqual(['a', 'b']);
    expect(homeSavedFeedFocus(next[0])).toEqual({
      kind: 'hashtag',
      value: 'near',
    });
  });

  it('prepends a new feed', () => {
    const next = upsertHomeSavedFeedList([], {
      kind: 'ticker',
      value: 'social',
    });
    expect(next).toHaveLength(1);
    expect(homeSavedFeedLabel(next[0])).toBe('$SOCIAL');
  });

  it('removes by id', () => {
    const feeds: HomeSavedFeed[] = [
      { id: 'a', kind: 'hashtag', value: 'near', createdAt: 1 },
      { id: 'b', kind: 'hashtag', value: 'ai', createdAt: 2 },
    ];
    expect(removeHomeSavedFeedFromList(feeds, 'a').map((f) => f.id)).toEqual([
      'b',
    ]);
  });
});
