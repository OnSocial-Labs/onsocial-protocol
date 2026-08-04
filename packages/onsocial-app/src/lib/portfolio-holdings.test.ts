import { describe, expect, it } from 'vitest';
import {
  holdingsActionLabel,
  holdingsHrefForOwned,
  holdingsKindLabel,
  toPortfolioHoldingPeek,
} from '@/lib/portfolio-holdings';
import { collectionIdFromTokenId } from '@/features/market/market-listings';

describe('collectionIdFromTokenId', () => {
  it('parses collection editions and skips post scarces', () => {
    expect(collectionIdFromTokenId('novella:3')).toBe('novella');
    expect(collectionIdFromTokenId('s:abc')).toBeNull();
    expect(collectionIdFromTokenId('solo')).toBeNull();
  });
});

describe('holdingsActionLabel', () => {
  it('maps medium kinds to use actions', () => {
    expect(holdingsActionLabel('writing')).toBe('Read');
    expect(holdingsActionLabel('music')).toBe('Play');
    expect(holdingsActionLabel('ticket')).toBe('Show pass');
    expect(holdingsActionLabel('coupon')).toBe('Redeem');
    expect(holdingsActionLabel('membership')).toBe('Open pass');
    expect(holdingsActionLabel('art')).toBe('Open');
    expect(holdingsActionLabel(null)).toBe('Open');
  });
});

describe('holdingsKindLabel', () => {
  it('uses market medium labels', () => {
    expect(holdingsKindLabel('writing')).toBe('Writing');
    expect(holdingsKindLabel('ticket')).toBe('Tickets');
    expect(holdingsKindLabel(null)).toBeNull();
  });
});

describe('toPortfolioHoldingPeek', () => {
  it('deep-links collection holdings with action copy', () => {
    const peek = toPortfolioHoldingPeek({
      tokenId: 'quiet-hours:1',
      title: 'The Quiet Hours',
      mediaUrl: 'https://cdn.example/cover.png',
      ownerId: 'alice.near',
      collectionId: 'quiet-hours',
      mediumKind: 'writing',
      listingKind: null,
    });
    expect(peek.href).toBe('/collection/quiet-hours');
    expect(peek.actionLabel).toBe('Read');
    expect(peek.kindLabel).toBe('Writing');
  });

  it('falls back to market when there is no collection', () => {
    expect(
      holdingsHrefForOwned({ tokenId: 's:post-1', sourcePostPath: undefined })
    ).toBe('/market');
  });
});
