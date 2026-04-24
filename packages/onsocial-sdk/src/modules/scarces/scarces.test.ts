import { describe, expect, it, vi } from 'vitest';
import { ScarcesModule } from './index.js';
import type { HttpClient } from '../../http.js';
import type { StorageProvider } from '../../storage/provider.js';

interface HttpMock {
  requestForm: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
}

function makeHttp(): HttpMock {
  return {
    requestForm: vi.fn().mockResolvedValue({ txHash: 'tok-form' }),
    post: vi.fn().mockResolvedValue({ ok: true, txHash: 'tok-json' }),
    get: vi.fn(),
  };
}

function asHttp(h: HttpMock): HttpClient {
  return h as unknown as HttpClient;
}

function makeStorage(): StorageProvider {
  return {
    upload: vi.fn().mockResolvedValue({
      cid: 'bafyUploaded',
      mime: 'image/png',
      size: 42,
    }),
    uploadJson: vi.fn(),
    url: (cid: string) => `https://gw/${cid}`,
  } as unknown as StorageProvider;
}

describe('ScarcesModule wiring', () => {
  it('exposes the seven sub-namespaces', () => {
    const mod = new ScarcesModule(asHttp(makeHttp()));
    expect(mod.tokens).toBeDefined();
    expect(mod.collections).toBeDefined();
    expect(mod.market).toBeDefined();
    expect(mod.auctions).toBeDefined();
    expect(mod.offers).toBeDefined();
    expect(mod.lazy).toBeDefined();
    expect(mod.fromPost).toBeDefined();
  });
});

describe('ScarcesModule.tokens — gateway compose path (no storage)', () => {
  it('mint without storage routes through /compose/mint as multipart', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    const result = await mod.tokens.mint({ title: 'Genesis' });
    expect(http.requestForm).toHaveBeenCalledWith(
      'POST',
      '/compose/mint',
      expect.any(FormData)
    );
    expect(result.txHash).toBe('tok-form');
  });

  it('transfer / burn / batchTransfer hit the /compose/* fallback', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.tokens.transfer('1', 'b.near');
    await mod.tokens.burn('2');
    await mod.tokens.batchTransfer([{ token_id: '1', receiver_id: 'b.near' }]);
    expect(http.post).toHaveBeenNthCalledWith(1, '/compose/transfer', {
      tokenId: '1',
      receiverId: 'b.near',
      memo: undefined,
    });
    expect(http.post).toHaveBeenNthCalledWith(2, '/compose/burn', {
      tokenId: '2',
      collectionId: undefined,
    });
    expect(http.post).toHaveBeenNthCalledWith(3, '/compose/batch-transfer', {
      transfers: [{ token_id: '1', receiver_id: 'b.near' }],
    });
  });
});

describe('ScarcesModule.tokens — local-upload path (storage configured)', () => {
  it('mint with image + storage uploads locally and submits via /relay/execute', async () => {
    const http = makeHttp();
    const storage = makeStorage();
    const mod = new ScarcesModule(asHttp(http), undefined, storage);
    const file = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    await mod.tokens.mint({ title: 'Local', image: file });

    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(http.requestForm).not.toHaveBeenCalled();
    expect(http.post).toHaveBeenCalledWith('/relay/execute', {
      action: {
        type: 'quick_mint',
        metadata: {
          title: 'Local',
          media: 'ipfs://bafyUploaded',
        },
      },
    });
  });

  it('mint with mediaCid and no image stays on /compose path (no storage call)', async () => {
    const http = makeHttp();
    const storage = makeStorage();
    const mod = new ScarcesModule(asHttp(http), undefined, storage);
    await mod.tokens.mint({ title: 'PreUploaded', mediaCid: 'bafyExisting' });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(http.requestForm).toHaveBeenCalledTimes(1);
  });
});

describe('ScarcesModule.collections', () => {
  it('create without storage routes through /compose/create-collection', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.collections.create({
      collectionId: 'g',
      totalSupply: 10,
      title: 'G',
    });
    expect(http.requestForm).toHaveBeenCalledWith(
      'POST',
      '/compose/create-collection',
      expect.any(FormData)
    );
  });

  it('create with image + storage uploads locally and submits the action', async () => {
    const http = makeHttp();
    const storage = makeStorage();
    const mod = new ScarcesModule(asHttp(http), undefined, storage);
    const file = new Blob([new Uint8Array([1])], { type: 'image/png' });
    await mod.collections.create({
      collectionId: 'g',
      totalSupply: 10,
      title: 'G',
      priceNear: '1',
      image: file,
    });
    expect(storage.upload).toHaveBeenCalledTimes(1);
    const call = http.post.mock.calls[0];
    expect(call[0]).toBe('/relay/execute');
    expect(call[1].action.type).toBe('create_collection');
    expect(call[1].action.collection_id).toBe('g');
  });

  it('mintFrom / purchaseFrom / airdrop / pause / resume / delete go through /compose/*', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.collections.mintFrom('g', 1);
    await mod.collections.purchaseFrom('g', '1', 1);
    await mod.collections.airdrop('g', ['a.near']);
    await mod.collections.pause('g');
    await mod.collections.resume('g');
    await mod.collections.delete('g');
    const calls = http.post.mock.calls.map(
      (c) => c[0]
    );
    expect(calls).toEqual([
      '/compose/mint-from-collection',
      '/compose/purchase-from-collection',
      '/compose/airdrop-from-collection',
      '/compose/pause-collection',
      '/compose/resume-collection',
      '/compose/delete-collection',
    ]);
  });
});

describe('ScarcesModule.market', () => {
  it('sell / delist / purchase route through /compose/*', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.market.sell({ tokenId: '1', priceNear: '1' });
    await mod.market.delist('1');
    await mod.market.purchase('1');
    const calls = http.post.mock.calls.map(
      (c) => c[0]
    );
    expect(calls).toEqual([
      '/compose/list-native-scarce',
      '/compose/delist-native-scarce',
      '/compose/purchase-native-scarce',
    ]);
  });
});

describe('ScarcesModule.auctions', () => {
  it('start / placeBid / settle / cancel route through /compose/*', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.auctions.start({
      tokenId: '1',
      reservePriceNear: '1',
      minBidIncrementNear: '0.1',
    });
    await mod.auctions.placeBid('1', '1');
    await mod.auctions.settle('1');
    await mod.auctions.cancel('1');
    const calls = http.post.mock.calls.map(
      (c) => c[0]
    );
    expect(calls).toEqual([
      '/compose/list-auction',
      '/compose/place-bid',
      '/compose/settle-auction',
      '/compose/cancel-auction',
    ]);
  });
});

describe('ScarcesModule.offers', () => {
  it('make / cancel / accept (token + collection) route through /compose/*', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.offers.make({ tokenId: '1', amountNear: '1' });
    await mod.offers.cancel('1');
    await mod.offers.accept('1', 'b.near');
    await mod.offers.makeCollection({ collectionId: 'g', amountNear: '1' });
    await mod.offers.cancelCollection('g');
    await mod.offers.acceptCollection('g', '1', 'b.near');
    const calls = http.post.mock.calls.map(
      (c) => c[0]
    );
    expect(calls).toEqual([
      '/compose/make-offer',
      '/compose/cancel-offer',
      '/compose/accept-offer',
      '/compose/make-collection-offer',
      '/compose/cancel-collection-offer',
      '/compose/accept-collection-offer',
    ]);
  });
});

describe('ScarcesModule.lazy', () => {
  it('create without storage routes through /compose/lazy-list', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.lazy.create({ title: 'L', priceNear: '5' });
    expect(http.requestForm).toHaveBeenCalledWith(
      'POST',
      '/compose/lazy-list',
      expect.any(FormData)
    );
  });

  it('create with image + storage uploads locally and submits action', async () => {
    const http = makeHttp();
    const storage = makeStorage();
    const mod = new ScarcesModule(asHttp(http), undefined, storage);
    const file = new Blob([new Uint8Array([1])], { type: 'image/png' });
    await mod.lazy.create({ title: 'L', priceNear: '5', image: file });
    expect(storage.upload).toHaveBeenCalledTimes(1);
    const call = http.post.mock.calls[0];
    expect(call[0]).toBe('/relay/execute');
    expect(call[1].action.type).toBe('create_lazy_listing');
    expect(call[1].action.metadata.media).toBe('ipfs://bafyUploaded');
  });

  it('purchase routes through /compose/purchase-lazy-listing', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.lazy.purchase('abc');
    expect(http.post).toHaveBeenCalledWith('/compose/purchase-lazy-listing', {
      listingId: 'abc',
    });
  });
});
