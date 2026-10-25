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
    ).toBe('Ticket · ×2 · 2 NEAR each');
  });

  it('marks an auction as the reserve', () => {
    expect(
      collectiblesHoldingFact(
        { ...ticket, listedPriceNear: '1', listingKind: 'auction' },
        1
      )
    ).toBe('Ticket · Reserve · 1 NEAR');
  });

  it('shows the dollar sticker instead of a zero NEAR ask', () => {
    expect(
      collectiblesHoldingFact(
        {
          ...ticket,
          listedPriceNear: '0',
          listedUsdE6: '1000000',
          listingKind: 'fixed',
        },
        1
      )
    ).toBe('Ticket · $1');
  });

  it('stays quiet when the ask is zero and no sticker arrived', () => {
    expect(
      collectiblesHoldingFact(
        { ...ticket, listedPriceNear: '0', listingKind: 'fixed' },
        1
      )
    ).toBe('Ticket');
  });

  it('says each only when every folded copy is listed at one ask', () => {
    const listedDollar = {
      listingKind: 'fixed' as const,
      listedPriceNear: '0',
      listedUsdE6: '1000000',
    };
    expect(
      collectiblesHoldingFact(ticket, 2, [
        { ...listedDollar },
        { ...listedDollar },
      ])
    ).toBe('Ticket · ×2 · $1 each');
  });

  it('counts the listed copies when only some are on sale', () => {
    expect(
      collectiblesHoldingFact(ticket, 2, [
        {
          listingKind: 'fixed' as const,
          listedPriceNear: '0',
          listedUsdE6: '1000000',
        },
        { listingKind: null },
      ])
    ).toBe('Ticket · ×2 · 1 listed');
  });

  it('counts the listed copies when the asks differ', () => {
    expect(
      collectiblesHoldingFact(ticket, 2, [
        { listingKind: 'fixed' as const, listedPriceNear: '1' },
        { listingKind: 'fixed' as const, listedPriceNear: '2' },
      ])
    ).toBe('Ticket · ×2 · 2 listed');
  });

  it('keeps a quiet folded row when nothing is listed', () => {
    expect(
      collectiblesHoldingFact(ticket, 2, [
        { listingKind: null },
        { listingKind: null },
      ])
    ).toBe('Ticket · ×2');
  });
});
