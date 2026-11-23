import { describe, expect, it } from 'vitest';
import { marketBrowseColdPending } from '@/features/market/market-browse-settle';

describe('marketBrowseColdPending', () => {
  const settled = {
    listingsReady: true,
    salesSettled: true,
    ownedSettled: true,
  };

  it('holds until browse, sales, and owned settle together', () => {
    expect(marketBrowseColdPending(settled)).toBe(false);
    expect(
      marketBrowseColdPending({ ...settled, listingsReady: false })
    ).toBe(true);
    expect(
      marketBrowseColdPending({ ...settled, salesSettled: false })
    ).toBe(true);
    expect(
      marketBrowseColdPending({ ...settled, ownedSettled: false })
    ).toBe(true);
  });

  it('does not gate on secondary seats (faces / offers)', () => {
    const source = marketBrowseColdPending.toString();
    expect(source).not.toContain('saleFaces');
    expect(source).not.toContain('offers');
  });
});
