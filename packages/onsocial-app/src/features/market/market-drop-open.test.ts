import { describe, expect, it } from 'vitest';
import {
  seedCollectionViewFromMarketListing,
  seedCollectionViewFromMarketSale,
} from '@/features/market/market-drop-open';

describe('market drop open seeds', () => {
  it('seeds a listing from collectionId and medium', () => {
    const view = seedCollectionViewFromMarketListing({
      collectionId: 'cats-1',
      title: 'The Secret Life of Cats',
      mediaUrl: 'https://cdn.example/cover.jpg',
      creatorId: 'seller.near',
      artistId: 'alice.near',
      mediumKind: 'writing',
      priceNear: '2',
      copies: 10,
      remaining: 4,
    });
    expect(view?.collectionId).toBe('cats-1');
    expect(view?.title).toBe('The Secret Life of Cats');
    expect(view?.mediaUrl).toBe('https://cdn.example/cover.jpg');
    expect(view?.creatorId).toBe('alice.near');
    expect(view?.kind).toBe('writing');
    expect(view?.totalSupply).toBe(10);
    expect(view?.remaining).toBe(4);
    expect(view?.priceNear).toBe('2');
    expect(view?.createdAtMs).toBe(0);
  });

  it('resolves listing collectionId from edition tokenId', () => {
    const view = seedCollectionViewFromMarketListing({
      tokenId: 'night-drive:3',
      title: 'Night Drive',
      creatorId: 'alice.near',
    });
    expect(view?.collectionId).toBe('night-drive');
    expect(seedCollectionViewFromMarketListing({ title: 'x' })).toBeNull();
  });

  it('seeds a recent sale drop from the edition token', () => {
    const view = seedCollectionViewFromMarketSale({
      tokenId: 'cats-1:4',
      title: 'The Secret Life of Cats',
      mediaUrl: 'https://cdn.example/cover.jpg',
      creatorId: 'alice.near',
    });
    expect(view?.collectionId).toBe('cats-1');
    expect(view?.creatorId).toBe('alice.near');
    expect(seedCollectionViewFromMarketSale({ title: 'x' })).toBeNull();
  });
});
