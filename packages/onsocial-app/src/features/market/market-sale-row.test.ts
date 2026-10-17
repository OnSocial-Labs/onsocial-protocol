import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  marketSaleDetailHref,
  marketSalePriceLabel,
  salePartyAccountId,
  salePartyLead,
} from '@/features/market/market-sale-row';

const rowSrc = join(
  dirname(fileURLToPath(import.meta.url)),
  'market-sale-row.tsx'
);

describe('marketSalePriceLabel', () => {
  it('rounds the NEAR after a dollar sticker to 2 decimals', () => {
    expect(
      marketSalePriceLabel({
        usdE6: '5000000',
        priceNear: '1.06864246861300357540199',
      })
    ).toBe('$5 · 1.07 NEAR');
    expect(
      marketSalePriceLabel({
        usdE6: '1000000',
        priceNear: '0.1977',
      })
    ).toBe('$1 · 0.20 NEAR');
  });

  it('opens the post when the sale has one', () => {
    expect(
      marketSaleDetailHref({
        postHref: '/@alice.near/posts/1',
        tokenId: 'drop-1:3',
      })
    ).toEqual({ href: '/@alice.near/posts/1', kind: 'post' });
  });

  it('opens the drop when the sale has no post', () => {
    expect(marketSaleDetailHref({ tokenId: 'drop-1:3' })).toEqual({
      href: '/collection/drop-1',
      kind: 'drop',
    });
  });

  it('stays plain when a post scarce has no post link', () => {
    expect(marketSaleDetailHref({ tokenId: 's:abc' })).toBeNull();
    expect(marketSaleDetailHref({})).toBeNull();
  });

  it('keeps a NEAR sale at 4 decimals', () => {
    expect(marketSalePriceLabel({ priceNear: '0.1' })).toBe('0.1 NEAR');
    expect(marketSalePriceLabel({ priceNear: '1' })).toBe('1 NEAR');
    expect(marketSalePriceLabel({ priceNear: '1.06864' })).toBe('1.0686 NEAR');
  });
});

describe('salePartyAccountId', () => {
  it('prefers the buyer, then the seller, then the creator', () => {
    expect(
      salePartyAccountId({
        buyerId: ' buyer.near ',
        sellerId: 'seller.near',
        creatorId: 'creator.near',
      })
    ).toBe('buyer.near');
    expect(
      salePartyAccountId({
        sellerId: 'seller.near',
        creatorId: 'creator.near',
      })
    ).toBe('seller.near');
    expect(salePartyAccountId({ creatorId: 'creator.near' })).toBe(
      'creator.near'
    );
    expect(salePartyAccountId({})).toBe('');
  });
});

describe('salePartyLead', () => {
  it('says bought by only when the sale names a buyer', () => {
    expect(salePartyLead({ buyerId: ' buyer.near ' })).toBe('bought by');
    expect(salePartyLead({ buyerId: '   ' })).toBe(false);
    expect(salePartyLead({})).toBe(false);
  });
});

describe('MarketSaleRow layout', () => {
  it('uses the listing row with the buyer, the amount, and the time dots', () => {
    const source = readFileSync(rowSrc, 'utf8');
    expect(source).toContain('className="market-listing-row market-sale-row"');
    expect(source).toContain('className="market-listing-row-open"');
    expect(source).toContain('lead={salePartyLead(sale)}');
    expect(source).toContain("'bought by'");
    expect(source).toContain('marketSalePriceLabel');
    expect(source).not.toContain('Sold ·');
    const trailAt = source.indexOf('drops-discovery-head-trail');
    const menuAt = source.indexOf('<MarketListingRowMenu');
    expect(trailAt).toBeGreaterThan(-1);
    expect(menuAt).toBeGreaterThan(trailAt);
    expect(source).not.toContain('OsSheetAction');
    expect(source).not.toContain('>Buy<');
  });
});
