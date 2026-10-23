import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  mapTokenHistoryRows,
  tokenHistoryLogIndex,
} from '@/features/scarces/scarce-token-history';

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
      'minter.near',
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

  it('labels a secondary purchase as Bought and leaves a failed ask out', () => {
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
        operation: 'royalty_paid',
        creatorId: 'artist.near',
        blockHeight: 2,
        blockTimestamp: Date.parse('2026-06-02T00:00:00Z'),
        amount: ONE_NEAR,
      },
      {
        operation: 'approval_granted',
        ownerId: 'seller.near',
        blockHeight: 4,
        blockTimestamp: Date.parse('2026-06-04T00:00:00Z'),
      },
      {
        operation: 'auction_bid',
        bidder: 'bidder.near',
        blockHeight: 3,
        blockTimestamp: Date.parse('2026-06-03T00:00:00Z'),
        bidAmount: ONE_NEAR,
      },
    ]);

    expect(rows.map((row) => row.label)).toEqual(['Bid', 'Bought']);
    expect(rows.map((row) => row.actor)).toEqual(['bidder.near', 'buyer.near']);
    expect(rows.map((row) => row.priceNear)).toEqual(['1', '1']);
  });

  it('shows a drop mint as this edition’s share, and an external list price', () => {
    const rows = mapTokenHistoryRows(
      [
        {
          eventType: 'COLLECTION_UPDATE',
          operation: 'purchase',
          buyerId: 'fan.near',
          author: 'fan.near',
          blockHeight: 1,
          blockTimestamp: Date.parse('2026-07-01T00:00:00Z'),
          price: TWO_NEAR,
          quantity: 2,
          extraData: JSON.stringify({
            token_ids: ['drop:1', 'drop:2'],
            quantity: 2,
          }),
        },
        {
          operation: 'list',
          ownerId: 'fan.near',
          author: 'fan.near',
          blockHeight: 2,
          blockTimestamp: Date.parse('2026-07-02T00:00:00Z'),
          extraData: JSON.stringify({
            token_ids: ['drop:1', 'drop:2'],
            prices: [ONE_NEAR, TWO_NEAR],
          }),
        },
        {
          operation: 'airdrop',
          author: 'artist.near',
          blockHeight: 3,
          blockTimestamp: Date.parse('2026-07-03T00:00:00Z'),
          extraData: JSON.stringify({
            token_ids: ['drop:1', 'drop:2'],
            receivers: ['ann.near', 'bob.near'],
          }),
        },
      ],
      'drop:2'
    );

    expect(rows.map((row) => row.label)).toEqual([
      'Airdropped',
      'Listed',
      'Minted',
    ]);
    expect(rows.map((row) => row.actor)).toEqual([
      'bob.near',
      'fan.near',
      'fan.near',
    ]);
    expect(rows.map((row) => row.priceNear)).toEqual([null, '2', '1']);
  });

  it('keeps a later log above an earlier one in the same block', () => {
    const rows = mapTokenHistoryRows([
      {
        id: 'receipt-1-SCARCE_UPDATE-list_native',
        operation: 'list_native',
        ownerId: 'seller.near',
        blockHeight: 9,
        blockTimestamp: Date.parse('2026-08-01T00:00:00Z'),
        price: ONE_NEAR,
      },
      {
        id: 'receipt-2-SCARCE_UPDATE-purchase',
        eventType: 'SCARCE_UPDATE',
        operation: 'purchase',
        buyerId: 'buyer.near',
        blockHeight: 9,
        blockTimestamp: Date.parse('2026-08-01T00:00:00Z'),
        price: ONE_NEAR,
      },
    ]);
    expect(tokenHistoryLogIndex('receipt-2-SCARCE_UPDATE-purchase')).toBe(2);
    expect(rows.map((row) => row.label)).toEqual(['Bought', 'Listed']);
  });

  it('names the person a transfer left', () => {
    const rows = mapTokenHistoryRows([
      {
        operation: 'transfer',
        author: 'operator.near',
        blockHeight: 1,
        blockTimestamp: Date.parse('2026-08-02T00:00:00Z'),
        extraData: JSON.stringify({
          old_owner_id: 'alice.near',
          sender_id: 'operator.near',
          receiver_id: 'bob.near',
        }),
      },
    ]);
    expect(rows[0]?.label).toBe('Transferred');
    expect(rows[0]?.actor).toBe('alice.near');
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

  it('loads the newest page first and offers Older', () => {
    const source = readFileSync(
      join(appSrc, 'features/scarces/scarce-token-history-sheet.tsx'),
      'utf8'
    );
    expect(source).toContain('newestFirst: true');
    expect(source).toContain('TOKEN_HISTORY_OMIT_OPERATIONS');
    expect(source).toMatch(/>\s*Older\s*</);
  });

  it('puts the listing ⋮ beside the time', () => {
    const source = readFileSync(
      join(appSrc, 'features/market/market-listing-row.tsx'),
      'utf8'
    );
    const trailAt = source.indexOf('drops-discovery-head-trail');
    const menuAt = source.indexOf('<MarketListingRowMenu');
    const buyAt = source.indexOf('className="market-listing-action"');
    expect(trailAt).toBeGreaterThan(-1);
    expect(menuAt).toBeGreaterThan(trailAt);
    expect(buyAt).toBeGreaterThan(menuAt);
    expect(source).not.toContain('ScarceEditionHistoryButton');
  });
});
