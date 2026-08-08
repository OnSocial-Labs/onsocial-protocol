import { describe, expect, it } from 'vitest';
import type { ScarcesCollectionCurrentRow } from '@onsocial/sdk';
import {
  displayFromOwnedCollectionCatalog,
  editionSeatFromTokenId,
} from '@/features/market/market-listings';

function catalog(
  over: Partial<ScarcesCollectionCurrentRow> &
    Pick<ScarcesCollectionCurrentRow, 'collectionId'>
): ScarcesCollectionCurrentRow {
  return {
    creatorId: 'alice.near',
    appId: null,
    price: null,
    allowlistPrice: null,
    totalSupply: 10,
    mintedCount: 2,
    remaining: 8,
    startTime: null,
    endTime: null,
    createdAt: null,
    mintMode: null,
    maxPerWallet: null,
    paused: false,
    cancelled: false,
    banned: false,
    transferable: true,
    renewable: false,
    maxRedeems: null,
    randomAssignment: false,
    appCommissionBps: null,
    title: null,
    media: null,
    description: null,
    kind: null,
    metadataTemplate: null,
    metadata: null,
    extraJson: null,
    royaltyJson: null,
    createdBlockHeight: 1,
    createdBlockTimestamp: 1,
    updatedBlockHeight: 1,
    updatedBlockTimestamp: 1,
    ...over,
  };
}

describe('displayFromOwnedCollectionCatalog', () => {
  it('reads title/media from metadataTemplate when columns are empty', () => {
    const face = displayFromOwnedCollectionCatalog(
      catalog({
        collectionId: 'drop-1',
        metadataTemplate: JSON.stringify({
          title: 'Night Drive',
          media: 'bafycoveraaaaaaaaaaaaaaaaaaaaaaaaaa',
          extra: JSON.stringify({ kind: 'audio' }),
        }),
      }),
      'drop-1:2'
    );

    expect(face.title).toBe('Night Drive');
    expect(face.mediaUrl).toContain('bafycover');
    expect(face.kind).toBe('audio');
  });

  it('substitutes variation seat media for the owned edition', () => {
    const face = displayFromOwnedCollectionCatalog(
      catalog({
        collectionId: 'drop-1',
        metadataTemplate: JSON.stringify({
          title: 'Edition',
          media: 'ipfs://bafy/{seat_number}.png',
        }),
      }),
      'drop-1:3'
    );

    expect(editionSeatFromTokenId('drop-1:3')).toBe(3);
    expect(face.title).toBe('Edition');
    expect(face.mediaUrl).toContain('/3.png');
  });

  it('returns null media when variation placeholders cannot be resolved', () => {
    const face = displayFromOwnedCollectionCatalog(
      catalog({
        collectionId: 'drop-1',
        metadataTemplate: JSON.stringify({
          title: 'Solo face',
          media: 'ipfs://bafy/{seat_number}.png',
        }),
      }),
      's:solo'
    );

    expect(editionSeatFromTokenId('s:solo')).toBeNull();
    expect(face.mediaUrl).toBeNull();
    expect(face.title).toBe('Solo face');
  });
});
