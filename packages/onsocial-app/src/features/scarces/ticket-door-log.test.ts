import { describe, expect, it } from 'vitest';
import type { ScarcesEventRow } from '@onsocial/sdk';
import {
  doorLogEntryMeta,
  mapDoorLogEntries,
} from '@/features/scarces/ticket-door-log';

function redeemRow(
  partial: Partial<ScarcesEventRow> &
    Pick<ScarcesEventRow, 'author' | 'ownerId' | 'tokenId' | 'blockTimestamp'>
): ScarcesEventRow {
  return {
    eventType: 'SCARCE_UPDATE',
    operation: 'redeem',
    author: partial.author,
    blockHeight: 1,
    blockTimestamp: partial.blockTimestamp,
    tokenId: partial.tokenId,
    collectionId: 'night-drive',
    listingId: null,
    ownerId: partial.ownerId,
    creatorId: null,
    buyerId: null,
    sellerId: null,
    bidder: null,
    accountId: null,
    appId: null,
    scarceContractId: null,
    amount: null,
    price: null,
    oldPrice: null,
    newPrice: null,
    bidAmount: null,
    marketplaceFee: null,
    appPoolAmount: null,
    creatorPayment: null,
    quantity: null,
    totalSupply: null,
    redeemCount: partial.redeemCount ?? null,
    maxRedeems: partial.maxRedeems ?? null,
    reservePrice: null,
    buyNowPrice: null,
    expiresAt: null,
    reason: null,
    memo: null,
    extraData: null,
  };
}

describe('ticket-door-log', () => {
  it('maps redeem events to guest + staff + seat', () => {
    const now = Date.UTC(2026, 7, 15, 12, 0, 0);
    const entries = mapDoorLogEntries(
      [
        redeemRow({
          author: 'door.near',
          ownerId: 'guest.near',
          tokenId: 'night-drive:3',
          blockTimestamp: now * 1e6,
          redeemCount: 1,
          maxRedeems: 1,
        }),
        redeemRow({
          author: 'door.near',
          ownerId: '',
          tokenId: 'night-drive:4',
          blockTimestamp: now * 1e6,
        }),
      ],
      now
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      guestId: 'guest.near',
      staffId: 'door.near',
      seatLabel: 'Pass 3',
      tokenId: 'night-drive:3',
    });
    expect(entries[0]!.timeLabel.length).toBeGreaterThan(0);
  });

  it('builds meta with staff label and multi-redeem', () => {
    const entry = mapDoorLogEntries([
      redeemRow({
        author: 'door.near',
        ownerId: 'guest.near',
        tokenId: 'night-drive:3',
        blockTimestamp: 1,
        redeemCount: 2,
        maxRedeems: 3,
      }),
    ])[0]!;
    expect(doorLogEntryMeta(entry, 'Door Lead', 'admit')).toBe(
      'Pass 3 · 2/3 · Admitted by Door Lead'
    );
    expect(doorLogEntryMeta(entry, 'Door Lead', 'redeem')).toBe(
      'Pass 3 · 2/3 · Redeemed by Door Lead'
    );
  });
});
