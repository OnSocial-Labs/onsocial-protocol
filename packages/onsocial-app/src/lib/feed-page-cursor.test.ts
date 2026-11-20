import { describe, expect, it } from 'vitest';
import { feedPageHasMore } from './feed-page-cursor';

describe('feedPageHasMore', () => {
  it('prefers either keyset or offset as has-more', () => {
    expect(feedPageHasMore({})).toBe(false);
    expect(feedPageHasMore({ nextOffset: 20 })).toBe(true);
    expect(feedPageHasMore({ nextBeforeBlockHeight: 99 })).toBe(true);
  });
});
