// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import type { OnSocial, ScarcesEventRow } from '@onsocial/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMarketSales } from '@/features/market/market-listings';
import {
  MarketSaleRow,
  marketSaleDetailHref,
  marketSalePriceLabel,
  salePartyAccountId,
  salePartyLead,
} from '@/features/market/market-sale-row';

const viewNearContract = vi.fn();

vi.mock('@/contexts/app-transaction-feedback-context', () => ({
  useAppTransactionFeedback: () => ({
    txResult: null,
    setTxResult: () => {},
    clearTxResult: () => {},
    trackTransaction: async () => false,
  }),
}));

vi.mock('@/lib/app-near-rpc', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/app-near-rpc')>(
      '@/lib/app-near-rpc'
    );
  return {
    ...actual,
    viewNearContract: (...args: unknown[]) => viewNearContract(...args),
  };
});

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
  it('says Bought by only when the sale names a buyer', () => {
    expect(salePartyLead({ buyerId: ' buyer.near ' })).toBe('Bought by');
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
    expect(source).toContain('avatarUrl={avatarUrl}');
    expect(source).not.toContain('usePostAuthorProfiles');
    expect(source).toContain("role: 'bought'");
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

function saleEvent(
  tokenId: string,
  extra: Record<string, unknown>
): ScarcesEventRow {
  return {
    eventType: 'SCARCE_UPDATE',
    operation: 'purchase',
    author: 'buyer.testnet',
    blockHeight: 10,
    blockTimestamp: Date.parse('2026-06-01T00:00:00.000Z'),
    tokenId,
    extraData: JSON.stringify(extra),
    price: '1000000000000000000000000',
  } as ScarcesEventRow;
}

function salesClient(rows: ScarcesEventRow[]): OnSocial {
  return {
    query: {
      scarces: {
        recentSales: async () => rows,
      },
    },
  } as unknown as OnSocial;
}

function visibleSaleTitles(): string[] {
  return [...document.querySelectorAll('.market-listing-title')].map(
    (node) => node.textContent ?? ''
  );
}

describe('recent sale row titles', () => {
  beforeEach(() => {
    viewNearContract.mockReset();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        media: '',
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })
    );
  });

  afterEach(() => {
    cleanup();
  });

  it('hydrates a collection edition instead of painting the raw token id', async () => {
    const tokenTitles = new Map<string, string | null>([
      ['name-xyz:1', 'A Quiet Miracle'],
      ['name-xyz:2', null],
      ['name-kept:1', 'Chain title that must not win'],
      ['s:319', 'Native Scarce'],
      ['s:42', null],
      ['s:7', 'Should not replace'],
    ]);
    viewNearContract.mockImplementation(
      async (_contract: unknown, method: unknown, args: unknown) => {
        if (method !== 'nft_token') return null;
        const tokenId =
          (args as { token_id?: string } | null)?.token_id?.trim() ?? '';
        const title = tokenTitles.get(tokenId) ?? null;
        return { metadata: { title } };
      }
    );

    const sales = await fetchMarketSales({
      client: salesClient([
        saleEvent('name-xyz:1', { kind: 'art' }),
        saleEvent('name-xyz:2', { kind: 'art' }),
        saleEvent('name-kept:1', { title: 'Kept by the sale' }),
        saleEvent('s:319', { kind: 'thought' }),
        saleEvent('s:42', { kind: 'thought' }),
        saleEvent('s:7', { title: 'Posted scarce' }),
      ]),
    });

    render(
      createElement(
        'ul',
        null,
        sales.map((sale, index) =>
          createElement(MarketSaleRow, {
            key: `${sale.tokenId ?? 'sale'}:${index}`,
            sale,
          })
        )
      )
    );

    expect(visibleSaleTitles()).toEqual([
      'A Quiet Miracle',
      'Scarce',
      'Kept by the sale',
      'Native Scarce',
      'Scarce',
      'Posted scarce',
    ]);
    expect(
      document
        .querySelector('.market-listing-row-open')
        ?.getAttribute('aria-label')
    ).toBe('Open drop for A Quiet Miracle');
    expect(visibleSaleTitles().join('\n')).not.toMatch(/name-xyz:\d/);
  });
});
