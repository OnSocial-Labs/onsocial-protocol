import { describe, expect, it } from 'vitest';
import { collectiblesHoldingFact } from '@/features/collectibles/collectibles-holding-row';

const ticket = {
  kindLabel: 'Ticket',
  tokenId: 'gate:4',
  listedPriceNear: null,
  listingKind: null,
};

describe('collectiblesHoldingFact', () => {
  it('puts the seat on the fact line for one copy', () => {
    expect(collectiblesHoldingFact(ticket, 1)).toBe('Ticket · #4');
  });

  it('collapses several editions into a count', () => {
    expect(collectiblesHoldingFact(ticket, 3)).toBe('Ticket · ×3');
  });

  it('keeps the seat beside a list price', () => {
    expect(
      collectiblesHoldingFact(
        { ...ticket, listedPriceNear: '0.1', listingKind: 'fixed' },
        1
      )
    ).toBe('Ticket · #4 · 0.1 NEAR');
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
    ).toBe('Ticket · #4 · Reserve · 1 NEAR');
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
    ).toBe('Ticket · #4 · $1');
  });

  it('stays quiet when the ask is zero and no sticker arrived', () => {
    expect(
      collectiblesHoldingFact(
        { ...ticket, listedPriceNear: '0', listingKind: 'fixed' },
        1
      )
    ).toBe('Ticket · #4');
  });

  it('omits the seat when the token has no edition seat', () => {
    expect(
      collectiblesHoldingFact(
        { ...ticket, tokenId: 's:post-1', kindLabel: 'Thought' },
        1
      )
    ).toBe('Thought');
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

  it('drops kind from the fact when the party lead already carries it', () => {
    expect(
      collectiblesHoldingFact(
        { ...ticket, listedPriceNear: '0.1', listingKind: 'fixed' },
        1,
        undefined,
        { omitKind: true }
      )
    ).toBe('#4 · 0.1 NEAR');
    expect(
      collectiblesHoldingFact(ticket, 2, undefined, { omitKind: true })
    ).toBe('×2');
  });
});
