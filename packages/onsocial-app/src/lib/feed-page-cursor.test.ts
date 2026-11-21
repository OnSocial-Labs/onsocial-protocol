import { describe, expect, it } from 'vitest';
import { feedPageHasMore } from './feed-page-cursor';

describe('feedPageHasMore', () => {
  it('requires height and content-path together', () => {
    expect(feedPageHasMore({})).toBe(false);
    expect(feedPageHasMore({ nextOffset: 20 })).toBe(false);
    expect(feedPageHasMore({ nextBeforeBlockHeight: 100 })).toBe(false);
    expect(
      feedPageHasMore({
        nextBeforeBlockHeight: 99,
        nextBeforeEventKey: '   ',
      })
    ).toBe(false);
    expect(
      feedPageHasMore({
        nextBeforeBlockHeight: 99,
        nextBeforeEventKey: 'a.near/post/1',
      })
    ).toBe(true);
  });
});
