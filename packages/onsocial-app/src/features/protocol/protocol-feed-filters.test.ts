import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_FEED_PAGE_SIZE,
  getVisibleProtocolBatch,
} from '@/features/protocol/protocol-feed-filters';

describe('getVisibleProtocolBatch', () => {
  it('paints the first page and reports remaining rows', () => {
    const items = Array.from({ length: 25 }, (_, index) => index);
    const batch = getVisibleProtocolBatch(items, PROTOCOL_FEED_PAGE_SIZE);
    expect(batch.visibleItems).toEqual(items.slice(0, 10));
    expect(batch.hasMore).toBe(true);
    expect(batch.shownCount).toBe(10);
  });

  it('clamps to the available list length', () => {
    const items = [1, 2, 3];
    const batch = getVisibleProtocolBatch(items, 40);
    expect(batch.visibleItems).toEqual(items);
    expect(batch.hasMore).toBe(false);
    expect(batch.shownCount).toBe(3);
  });
});
