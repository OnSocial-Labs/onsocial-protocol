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
  it('exposes the eight sub-namespaces', () => {
    const mod = new ScarcesModule(asHttp(makeHttp()));
    expect(mod.tokens).toBeDefined();
    expect(mod.collections).toBeDefined();
    expect(mod.market).toBeDefined();
    expect(mod.auctions).toBeDefined();
    expect(mod.offers).toBeDefined();
    expect(mod.lazy).toBeDefined();
    expect(mod.fromPost).toBeDefined();
    expect(mod.apps).toBeDefined();
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
    const calls = http.post.mock.calls.map((c) => c[0]);
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
    const calls = http.post.mock.calls.map((c) => c[0]);
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
    const calls = http.post.mock.calls.map((c) => c[0]);
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
    const calls = http.post.mock.calls.map((c) => c[0]);
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

  it('cancel routes through /compose/cancel-lazy-list', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.lazy.cancel('abc');
    expect(http.post).toHaveBeenCalledWith('/compose/cancel-lazy-list', {
      listingId: 'abc',
    });
  });
});

describe('ScarcesModule.tokens — lifecycle helpers', () => {
  it('renew routes through /compose/renew-token', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.tokens.renew('t1', 'col1', 1234);
    expect(http.post).toHaveBeenCalledWith('/compose/renew-token', {
      tokenId: 't1',
      collectionId: 'col1',
      newExpiresAt: 1234,
    });
  });

  it('redeem routes through /compose/redeem-token', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.tokens.redeem('t1', 'col1');
    expect(http.post).toHaveBeenCalledWith('/compose/redeem-token', {
      tokenId: 't1',
      collectionId: 'col1',
    });
  });

  it('revoke routes through /compose/revoke-token', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.tokens.revoke('t1', 'col1', 'spam');
    expect(http.post).toHaveBeenCalledWith('/compose/revoke-token', {
      tokenId: 't1',
      collectionId: 'col1',
      memo: 'spam',
    });
  });

  it('claimRefund routes through /compose/claim-refund', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.tokens.claimRefund('t1', 'col1');
    expect(http.post).toHaveBeenCalledWith('/compose/claim-refund', {
      tokenId: 't1',
      collectionId: 'col1',
    });
  });
});

describe('ScarcesModule.collections — management helpers', () => {
  it('updatePrice routes through /compose/update-collection-price', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.collections.updatePrice('col1', '2.5');
    expect(http.post).toHaveBeenCalledWith('/compose/update-collection-price', {
      collectionId: 'col1',
      newPriceNear: '2.5',
    });
  });

  it('updateTiming routes through /compose/update-collection-timing', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.collections.updateTiming('col1', { startTime: 1, endTime: 2 });
    expect(http.post).toHaveBeenCalledWith(
      '/compose/update-collection-timing',
      { collectionId: 'col1', startTime: 1, endTime: 2 }
    );
  });

  it('setAllowlist routes through /compose/set-allowlist', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.collections.setAllowlist('col1', [
      { account_id: 'alice.near', allocation: 3 },
    ]);
    expect(http.post).toHaveBeenCalledWith('/compose/set-allowlist', {
      collectionId: 'col1',
      entries: [{ account_id: 'alice.near', allocation: 3 }],
    });
  });

  it('removeFromAllowlist routes through /compose/remove-from-allowlist', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.collections.removeFromAllowlist('col1', ['a.near', 'b.near']);
    expect(http.post).toHaveBeenCalledWith('/compose/remove-from-allowlist', {
      collectionId: 'col1',
      accounts: ['a.near', 'b.near'],
    });
  });

  it('setMetadata routes through /compose/set-collection-metadata', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.collections.setMetadata('col1', '{"x":1}');
    expect(http.post).toHaveBeenCalledWith('/compose/set-collection-metadata', {
      collectionId: 'col1',
      metadata: '{"x":1}',
    });
  });

  it('setAppMetadata routes through /compose/set-collection-app-metadata', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.collections.setAppMetadata('app1', 'col1', null);
    expect(http.post).toHaveBeenCalledWith(
      '/compose/set-collection-app-metadata',
      { appId: 'app1', collectionId: 'col1', metadata: null }
    );
  });

  it('cancel routes through /compose/cancel-collection', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.collections.cancel('col1', '0.5', 99);
    expect(http.post).toHaveBeenCalledWith('/compose/cancel-collection', {
      collectionId: 'col1',
      refundPerTokenNear: '0.5',
      refundDeadlineNs: 99,
    });
  });

  it('withdrawUnclaimedRefunds routes through /compose/withdraw-unclaimed-refunds', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.collections.withdrawUnclaimedRefunds('col1');
    expect(http.post).toHaveBeenCalledWith(
      '/compose/withdraw-unclaimed-refunds',
      { collectionId: 'col1' }
    );
  });
});

describe('ScarcesModule.market — management helpers', () => {
  it('updateSalePrice routes through /compose/update-sale-price', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.market.updateSalePrice('scarces.near', 't1', '7');
    expect(http.post).toHaveBeenCalledWith('/compose/update-sale-price', {
      scarceContractId: 'scarces.near',
      tokenId: 't1',
      priceNear: '7',
    });
  });

  it('delistExternal routes through /compose/delist-external-scarce', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.market.delistExternal('scarces.near', 't1');
    expect(http.post).toHaveBeenCalledWith('/compose/delist-external-scarce', {
      scarceContractId: 'scarces.near',
      tokenId: 't1',
    });
  });
});

describe('ScarcesModule.apps', () => {
  it('register routes through /compose/register-app', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.apps.register('app1', { primarySaleBps: 250, curated: true });
    expect(http.post).toHaveBeenCalledWith('/compose/register-app', {
      appId: 'app1',
      primarySaleBps: 250,
      curated: true,
    });
  });

  it('setConfig routes through /compose/set-app-config', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.apps.setConfig('app1', { metadata: 'x' });
    expect(http.post).toHaveBeenCalledWith('/compose/set-app-config', {
      appId: 'app1',
      metadata: 'x',
    });
  });

  it('fundPool routes through /compose/fund-app-pool', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.apps.fundPool('app1');
    expect(http.post).toHaveBeenCalledWith('/compose/fund-app-pool', {
      appId: 'app1',
    });
  });

  it('withdrawPool routes through /compose/withdraw-app-pool', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.apps.withdrawPool('app1', '1');
    expect(http.post).toHaveBeenCalledWith('/compose/withdraw-app-pool', {
      appId: 'app1',
      amountNear: '1',
    });
  });

  it('transferOwnership routes through /compose/transfer-app-ownership', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.apps.transferOwnership('app1', 'new.near');
    expect(http.post).toHaveBeenCalledWith('/compose/transfer-app-ownership', {
      appId: 'app1',
      newOwner: 'new.near',
    });
  });

  it('addModerator routes through /compose/add-moderator', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.apps.addModerator('app1', 'mod.near');
    expect(http.post).toHaveBeenCalledWith('/compose/add-moderator', {
      appId: 'app1',
      accountId: 'mod.near',
    });
  });

  it('removeModerator routes through /compose/remove-moderator', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.apps.removeModerator('app1', 'mod.near');
    expect(http.post).toHaveBeenCalledWith('/compose/remove-moderator', {
      appId: 'app1',
      accountId: 'mod.near',
    });
  });

  it('banCollection routes through /compose/ban-collection', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.apps.banCollection('app1', 'col1', 'spam');
    expect(http.post).toHaveBeenCalledWith('/compose/ban-collection', {
      appId: 'app1',
      collectionId: 'col1',
      reason: 'spam',
    });
  });

  it('unbanCollection routes through /compose/unban-collection', async () => {
    const http = makeHttp();
    const mod = new ScarcesModule(asHttp(http));
    await mod.apps.unbanCollection('app1', 'col1');
    expect(http.post).toHaveBeenCalledWith('/compose/unban-collection', {
      appId: 'app1',
      collectionId: 'col1',
    });
  });
});
