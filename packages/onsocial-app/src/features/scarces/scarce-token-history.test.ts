import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mapTokenHistoryRows } from '@/features/scarces/scarce-token-history';

const appSrc = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ONE_NEAR = '1000000000000000000000000';
const TWO_NEAR = '2000000000000000000000000';

describe('mapTokenHistoryRows', () => {
  it('shows the latest event first, with who and a price only when the event had one', () => {
    const rows = mapTokenHistoryRows([
      {
        eventType: 'COLLECTION_UPDATE',
        operation: 'purchase',
        author: 'minter.near',
        buyerId: 'minter.near',
        blockHeight: 10,
        blockTimestamp: Date.parse('2026-01-01T00:00:00Z'),
        price: ONE_NEAR,
      },
      {
        operation: 'list_native',
        author: 'minter.near',
        ownerId: 'minter.near',
        blockHeight: 20,
        blockTimestamp: Date.parse('2026-02-01T00:00:00Z'),
        price: TWO_NEAR,
      },
      {
        operation: 'transfer',
        author: 'minter.near',
        blockHeight: 30,
        blockTimestamp: Date.parse('2026-03-01T00:00:00Z'),
        price: ONE_NEAR,
        extraData: JSON.stringify({ receiver_id: 'bob.near' }),
      },
      {
        operation: 'update_price',
        ownerId: 'bob.near',
        blockHeight: 40,
        blockTimestamp: Date.parse('2026-04-01T00:00:00Z'),
        price: ONE_NEAR,
        newPrice: TWO_NEAR,
      },
      {
        operation: 'burn',
        author: 'bob.near',
        ownerId: 'bob.near',
        blockHeight: 50,
        blockTimestamp: Date.parse('2026-05-01T00:00:00Z'),
        price: TWO_NEAR,
      },
    ]);

    expect(rows.map((row) => row.label)).toEqual([
      'Burned',
      'Price changed',
      'Transferred',
      'Listed',
      'Minted',
    ]);
    expect(rows.map((row) => row.actor)).toEqual([
      'bob.near',
      'bob.near',
      'bob.near',
      'minter.near',
      'minter.near',
    ]);
    expect(rows.map((row) => row.priceNear)).toEqual([
      null,
      '2',
      null,
      '2',
      '1',
    ]);
    expect(rows[0]?.timeTitle).toContain('2026');
  });

  it('labels a secondary purchase as Bought and keeps a failed ask', () => {
    const rows = mapTokenHistoryRows([
      {
        eventType: 'SCARCE_UPDATE',
        operation: 'purchase',
        buyerId: 'buyer.near',
        sellerId: 'seller.near',
        author: 'buyer.near',
        blockHeight: 1,
        blockTimestamp: Date.parse('2026-06-01T00:00:00Z'),
        price: ONE_NEAR,
      },
      {
        operation: 'purchase_failed',
        author: 'buyer.near',
        buyerId: 'buyer.near',
        blockHeight: 2,
        blockTimestamp: Date.parse('2026-06-02T00:00:00Z'),
        extraData: JSON.stringify({ attempted_price: TWO_NEAR }),
      },
      {
        operation: 'auction_bid',
        bidder: 'bidder.near',
        blockHeight: 3,
        blockTimestamp: Date.parse('2026-06-03T00:00:00Z'),
        bidAmount: ONE_NEAR,
      },
    ]);

    expect(rows.map((row) => row.label)).toEqual([
      'Bid',
      'Purchase failed',
      'Bought',
    ]);
    expect(rows.map((row) => row.actor)).toEqual([
      'bidder.near',
      'buyer.near',
      'buyer.near',
    ]);
    expect(rows.map((row) => row.priceNear)).toEqual(['1', '2', '1']);
  });

  it('humanizes an unknown operation and skips a missing price', () => {
    const rows = mapTokenHistoryRows([
      {
        operation: 'metadata_update',
        author: 'artist.near',
        blockHeight: 1,
        blockTimestamp: 0,
      },
    ]);
    expect(rows[0]?.label).toBe('Metadata update');
    expect(rows[0]?.actor).toBe('artist.near');
    expect(rows[0]?.priceNear).toBeNull();
    expect(rows[0]?.time).toBe('');
    expect(rows[0]?.timeTitle).toBeUndefined();
  });
});

describe('edition history entry points', () => {
  it('puts History in its own section above Manage on an owned scarce', () => {
    const source = readFileSync(
      join(appSrc, 'features/collectibles/collectibles-holding-row-menu.tsx'),
      'utf8'
    );
    const historyAt = source.indexOf("section: 'History'");
    const manageAt = source.indexOf("section: 'Manage'");
    expect(historyAt).toBeGreaterThan(-1);
    expect(manageAt).toBeGreaterThan(historyAt);
    expect(source).toContain('ScarceTokenHistorySheet');
    expect(source).toContain("label: 'History'");
  });

  it('offers History on a market listing only when the row is one edition', () => {
    const source = readFileSync(
      join(appSrc, 'features/market/market-listing-row.tsx'),
      'utf8'
    );
    expect(source).toContain('ScarceEditionHistoryButton');
    expect(source).toContain('item.tokenId?.trim()');
    expect(source).toContain('market-listing-action-col');
  });
});
