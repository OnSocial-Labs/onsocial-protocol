import { describe, expect, it } from 'vitest';
import {
  readPostQuotesTabFromHref,
  readPostQuotesTabValue,
  withPostQuotesTab,
} from './post-routes';
import { resolveThreadShareRow, threadShareRowHref } from './thread-share-row';

describe('resolveThreadShareRow', () => {
  it('hides the row when the post has no quotes or reposts', () => {
    expect(resolveThreadShareRow(0, 0)).toBeNull();
    expect(resolveThreadShareRow(-1, Number.NaN)).toBeNull();
  });

  it('labels quotes only and counts those quotes', () => {
    expect(resolveThreadShareRow(3, 0)).toEqual({
      label: 'View quotes',
      count: 3,
      tab: 'quotes',
    });
  });

  it('labels reposts only and opens the Reposts tab', () => {
    expect(resolveThreadShareRow(0, 2)).toEqual({
      label: 'View reposts',
      count: 2,
      tab: 'reposts',
    });
  });

  it('keeps View quotes when both exist and counts the card share total', () => {
    expect(resolveThreadShareRow(4, 5)).toEqual({
      label: 'View quotes',
      count: 9,
      tab: 'quotes',
    });
  });
});

describe('thread share href', () => {
  it('leaves quotes links clean and marks reposts', () => {
    const quotes = resolveThreadShareRow(1, 2);
    const reposts = resolveThreadShareRow(0, 2);
    expect(quotes).not.toBeNull();
    expect(reposts).not.toBeNull();
    expect(threadShareRowHref('/@alice.near/posts/1/quotes', quotes!)).toBe(
      '/@alice.near/posts/1/quotes'
    );
    expect(
      threadShareRowHref('/groups/dao/posts/alice.near/1/quotes', reposts!)
    ).toBe('/groups/dao/posts/alice.near/1/quotes?tab=reposts');
  });

  it('reads the tab from a href and ignores unknown values', () => {
    expect(
      readPostQuotesTabFromHref('/@alice.near/posts/1/quotes?tab=reposts')
    ).toBe('reposts');
    expect(
      readPostQuotesTabFromHref('/@alice.near/posts/1/quotes?reply=9#top')
    ).toBe('quotes');
    expect(readPostQuotesTabValue(['reposts', 'quotes'])).toBe('reposts');
    expect(withPostQuotesTab('/quotes#panel', 'quotes')).toBe('/quotes#panel');
  });
});
