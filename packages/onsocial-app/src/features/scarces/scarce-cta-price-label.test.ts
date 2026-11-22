import { describe, expect, it } from 'vitest';
import { scarceCtaPriceLabel } from '@/features/scarces/post-scarce-cta';
import { scarceEmbedCommercePaintReady } from '@/features/scarces/scarce-embed-ledger';

describe('scarceCtaPriceLabel', () => {
  it('prefers dollars when usdE6 is present', () => {
    expect(
      scarceCtaPriceLabel({ usdE6: '2500000', priceNear: '1' })
    ).toBe('$2.5');
  });

  it('falls back to NEAR when there is no dollar sticker', () => {
    expect(scarceCtaPriceLabel({ priceNear: '1' })).toBe('1 NEAR');
  });

  it('returns null when neither unit is available', () => {
    expect(scarceCtaPriceLabel({})).toBeNull();
  });
});

describe('scarceEmbedCommercePaintReady', () => {
  it('holds the seat for jacket paint without an ask', () => {
    expect(
      scarceEmbedCommercePaintReady({
        status: 'drop',
        collectionId: 'drop-1',
        events: [],
      })
    ).toBe(false);
  });

  it('treats confirmed none as settled — not a pending seat', () => {
    expect(
      scarceEmbedCommercePaintReady({
        status: 'none',
        events: [],
      })
    ).toBe(false);
  });

  it('paints live CTA once an ask or terminal state is known', () => {
    expect(
      scarceEmbedCommercePaintReady({
        status: 'drop',
        collectionId: 'drop-1',
        priceNear: '1',
        events: [],
      })
    ).toBe(true);
    expect(
      scarceEmbedCommercePaintReady({
        status: 'sold',
        collectionId: 'drop-1',
        events: [],
      })
    ).toBe(true);
  });
});
