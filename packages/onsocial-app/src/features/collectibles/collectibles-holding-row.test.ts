import { describe, expect, it } from 'vitest';
import { collectiblesHoldingFact } from '@/features/collectibles/collectibles-holding-row';

const ticket = {
  kindLabel: 'Ticket',
  listedPriceNear: null,
  listingKind: null,
};

describe('collectiblesHoldingFact', () => {
  it('names only the kind when one copy is held', () => {
    expect(collectiblesHoldingFact(ticket, 1)).toBe('Ticket');
  });

  it('collapses several editions into a count', () => {
    expect(collectiblesHoldingFact(ticket, 3)).toBe('Ticket · ×3');
  });

  it('replaces a single copy with the list price', () => {
    expect(
      collectiblesHoldingFact(
        { ...ticket, listedPriceNear: '0.1', listingKind: 'fixed' },
        1
      )
    ).toBe('Ticket · 0.1 NEAR');
  });

  it('keeps the folded count beside a list price', () => {
    expect(
      collectiblesHoldingFact(
        { ...ticket, listedPriceNear: '2', listingKind: 'fixed' },
        2
      )
    ).toBe('Ticket · ×2 · 2 NEAR');
  });

  it('marks an auction as the reserve', () => {
    expect(
      collectiblesHoldingFact(
        { ...ticket, listedPriceNear: '1', listingKind: 'auction' },
        1
      )
    ).toBe('Ticket · Reserve · 1 NEAR');
  });
});
