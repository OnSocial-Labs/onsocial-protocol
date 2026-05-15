import { describe, expect, it, vi } from 'vitest';
import { ScarcesModule } from './index.js';
import { SCARCES_VERBS } from './verbs.js';
import type { HttpClient } from '../../internal/http.js';
import type { StorageProvider } from '../../storage/provider.js';

// ---------------------------------------------------------------------------
// Harness — every write now goes through session-bridge:
//   - simple compose verbs   : POST /compose/prepare/<verb> then /relay/delegate
//   - client-built actions   : POST /relay/delegate (signAndRelay)
//   - FormData upload routes : POST /compose/prepare/<verb> (multipart) then
//                              /relay/delegate (composeFormAndSign).
// ---------------------------------------------------------------------------

interface HttpMock {
  requestForm: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  network: 'mainnet';
}

function makeHttp(): HttpMock {
  const mock: HttpMock = {
    requestForm: vi.fn(async (_method: string, path: string) => {
      if (path.startsWith('/compose/prepare/')) {
        const verb = path.replace('/compose/prepare/', '');
        const action: Record<string, unknown> = {
          type:
            verb === 'mint'
              ? 'quick_mint'
              : verb === 'create-collection'
                ? 'create_collection'
                : verb === 'lazy-list'
                  ? 'create_lazy_listing'
                  : 'prepared_stub',
          metadata: { media: 'ipfs://bafyServer' },
        };
        return {
          action,
          target_account: 'scarces.onsocial.near',
          media: {
            cid: 'bafyServer',
            url: 'https://gw/bafyServer',
            size: 100,
            hash: 'h',
          },
        };
      }
      throw new Error(`unexpected requestForm ${path}`);
    }),
    post: vi.fn(async (path: string) => {
      if (path.startsWith('/compose/prepare/')) {
        return {
          action: { type: 'prepared_stub' },
          target_account: 'scarces.onsocial.near',
        };
      }
      if (path.startsWith('/relay/delegate')) {
        return { ok: true, txHash: 'tok-signed' };
      }
      throw new Error(`unexpected POST ${path}`);
    }),
    get: vi.fn(async (path: string) => {
      if (path === '/relay/latest-block') return { block_height: 100 };
      throw new Error(`unexpected GET ${path}`);
    }),
    network: 'mainnet',
  };
  return mock;
}

function makeSessionGetter() {
  const signed: Array<{
    action: Record<string, unknown>;
    targetAccount: string;
    depositYocto?: string;
  }> = [];
  const session = {
    signComposeDelegate: vi.fn(
      async (args: {
        action: Record<string, unknown>;
        targetContract: string;
        depositYocto?: string | bigint;
      }) => {
        signed.push({
          action: args.action,
          targetAccount: args.targetContract,
          ...(args.depositYocto !== undefined && {
            depositYocto: String(args.depositYocto),
          }),
        });
        return { base64: 'BASE64_DELEGATE_BLOB', nonce: 1 };
      }
    ),
  };
  const getter = () => session as never;
  return { getter, signed };
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

function prepareCallPaths(post: ReturnType<typeof vi.fn>): string[] {
  return (post.mock.calls as unknown as Array<[string, unknown]>)
    .map(([p]) => p)
    .filter((p) => p.startsWith('/compose/prepare/'));
}

function prepareBodyFor(
  post: ReturnType<typeof vi.fn>,
  verb: string
): Record<string, unknown> {
  const calls = post.mock.calls as unknown as Array<
    [string, Record<string, unknown>]
  >;
  const call = calls.find(([p]) => p === `/compose/prepare/${verb}`);
  if (!call) throw new Error(`no /compose/prepare/${verb} call`);
  return call[1];
}

describe('ScarcesModule wiring', () => {
  it('exposes the eight sub-namespaces', () => {
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(makeHttp()), getter);
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

describe('ScarcesModule.tokens — gateway upload route (no storage)', () => {
  it('mint without storage routes through /compose/prepare/mint then /relay/delegate', async () => {
    const http = makeHttp();
    const { getter, signed } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    const result = await mod.tokens.mint({ title: 'Genesis' });
    expect(http.requestForm).toHaveBeenCalledWith(
      'POST',
      '/compose/prepare/mint',
      expect.any(FormData)
    );
    expect(signed[0].action.type).toBe('quick_mint');
    expect(signed[0].targetAccount).toBe('scarces.onsocial.near');
    expect(signed[0].depositYocto).toBeUndefined();
    expect(http.post).toHaveBeenCalledWith(
      '/relay/delegate?wait=true',
      expect.objectContaining({ signed_delegate: 'BASE64_DELEGATE_BLOB' })
    );
    expect(result.txHash).toBe('tok-signed');
    expect(result.media?.cid).toBe('bafyServer');
  });

  it('transfer / burn / batchTransfer go through compose/prepare/<verb>', async () => {
    const http = makeHttp();
    const { getter, signed } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.tokens.transfer('1', 'b.near');
    await mod.tokens.burn('2');
    await mod.tokens.batchTransfer([{ token_id: '1', receiver_id: 'b.near' }]);
    expect(signed.map((s) => s.depositYocto)).toEqual(['1', '1', '1']);
    expect(prepareCallPaths(http.post)).toEqual([
      '/compose/prepare/transfer',
      '/compose/prepare/burn',
      '/compose/prepare/batch-transfer',
    ]);
    expect(prepareBodyFor(http.post, 'transfer')).toEqual({
      tokenId: '1',
      receiverId: 'b.near',
      memo: undefined,
    });
    expect(prepareBodyFor(http.post, 'burn')).toEqual({
      tokenId: '2',
      collectionId: undefined,
    });
    expect(prepareBodyFor(http.post, 'batch-transfer')).toEqual({
      transfers: [{ token_id: '1', receiver_id: 'b.near' }],
    });
  });
});

describe('ScarcesModule.tokens — local-upload path (storage configured)', () => {
  it('mint with image + storage uploads locally and submits via /relay/delegate', async () => {
    const http = makeHttp();
    const storage = makeStorage();
    const { getter, signed } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter, undefined, storage);
    const file = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    await mod.tokens.mint({ title: 'Local', image: file });

    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(http.requestForm).not.toHaveBeenCalled();
    expect(signed[0]).toEqual({
      action: {
        type: 'quick_mint',
        metadata: {
          title: 'Local',
          media: 'ipfs://bafyUploaded',
        },
      },
      targetAccount: 'scarces.onsocial.near',
    });
  });

  it('mint with mediaCid and no image stays on the multipart prepare path', async () => {
    const http = makeHttp();
    const storage = makeStorage();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter, undefined, storage);
    await mod.tokens.mint({ title: 'PreUploaded', mediaCid: 'bafyExisting' });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(http.requestForm).toHaveBeenCalledTimes(1);
    expect(http.requestForm).toHaveBeenCalledWith(
      'POST',
      '/compose/prepare/mint',
      expect.any(FormData)
    );
  });
});

describe('ScarcesModule.collections', () => {
  it('create without storage routes through /compose/prepare/create-collection then /relay/delegate', async () => {
    const http = makeHttp();
    const { getter, signed } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.collections.create({
      collectionId: 'g',
      totalSupply: 10,
      title: 'G',
    });
    expect(http.requestForm).toHaveBeenCalledWith(
      'POST',
      '/compose/prepare/create-collection',
      expect.any(FormData)
    );
    expect(signed[0].action.type).toBe('create_collection');
    expect(signed[0].depositYocto).toBeUndefined();
    expect(signed[0].targetAccount).toBe('scarces.onsocial.near');
  });

  it('create with image + storage uploads locally and submits the action', async () => {
    const http = makeHttp();
    const storage = makeStorage();
    const { getter, signed } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter, undefined, storage);
    const file = new Blob([new Uint8Array([1])], { type: 'image/png' });
    await mod.collections.create({
      collectionId: 'g',
      totalSupply: 10,
      title: 'G',
      priceNear: '1',
      image: file,
    });
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(signed[0].action.type).toBe('create_collection');
    expect((signed[0].action as Record<string, unknown>).collection_id).toBe(
      'g'
    );
    expect(signed[0].targetAccount).toBe('scarces.onsocial.near');
  });

  it('mintFrom / purchaseFrom / airdrop / pause / resume / delete go through compose/prepare/*', async () => {
    const http = makeHttp();
    const { getter, signed } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.collections.mintFrom('g', 1);
    await mod.collections.purchaseFrom('g', '1', 1);
    await mod.collections.airdrop('g', ['a.near']);
    await mod.collections.pause('g');
    await mod.collections.resume('g');
    await mod.collections.delete('g');
    expect(signed.map((s) => s.depositYocto)).toEqual([
      undefined,
      undefined,
      undefined,
      '1',
      '1',
      '1',
    ]);
    expect(prepareCallPaths(http.post)).toEqual([
      '/compose/prepare/mint-from-collection',
      '/compose/prepare/purchase-from-collection',
      '/compose/prepare/airdrop-from-collection',
      '/compose/prepare/pause-collection',
      '/compose/prepare/resume-collection',
      '/compose/prepare/delete-collection',
    ]);
  });
});

describe('ScarcesModule.market', () => {
  it('sell / delist / purchase route through compose/prepare/*', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.market.sell({ tokenId: '1', priceNear: '1' });
    await mod.market.delist('1');
    await mod.market.purchase('1');
    expect(prepareCallPaths(http.post)).toEqual([
      '/compose/prepare/list-native-scarce',
      '/compose/prepare/delist-native-scarce',
      '/compose/prepare/purchase-native-scarce',
    ]);
  });
});

describe('ScarcesModule.auctions', () => {
  it('start / placeBid / settle / cancel route through compose/prepare/*', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.auctions.start({
      tokenId: '1',
      reservePriceNear: '1',
      minBidIncrementNear: '0.1',
    });
    await mod.auctions.placeBid('1', '1');
    await mod.auctions.settle('1');
    await mod.auctions.cancel('1');
    expect(prepareCallPaths(http.post)).toEqual([
      '/compose/prepare/list-auction',
      '/compose/prepare/place-bid',
      '/compose/prepare/settle-auction',
      '/compose/prepare/cancel-auction',
    ]);
  });
});

describe('ScarcesModule.offers', () => {
  it('make / cancel / accept (token + collection) route through compose/prepare/*', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.offers.make({ tokenId: '1', amountNear: '1' });
    await mod.offers.cancel('1');
    await mod.offers.accept('1', 'b.near');
    await mod.offers.makeCollection({ collectionId: 'g', amountNear: '1' });
    await mod.offers.cancelCollection('g');
    await mod.offers.acceptCollection('g', '1', 'b.near');
    expect(prepareCallPaths(http.post)).toEqual([
      '/compose/prepare/make-offer',
      '/compose/prepare/cancel-offer',
      '/compose/prepare/accept-offer',
      '/compose/prepare/make-collection-offer',
      '/compose/prepare/cancel-collection-offer',
      '/compose/prepare/accept-collection-offer',
    ]);
  });
});

describe('ScarcesModule.lazy', () => {
  it('create without storage routes through /compose/prepare/lazy-list then /relay/delegate', async () => {
    const http = makeHttp();
    const { getter, signed } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.lazy.create({ title: 'L', priceNear: '5' });
    expect(http.requestForm).toHaveBeenCalledWith(
      'POST',
      '/compose/prepare/lazy-list',
      expect.any(FormData)
    );
    expect(signed[0].action.type).toBe('create_lazy_listing');
    expect(signed[0].targetAccount).toBe('scarces.onsocial.near');
  });

  it('create with image + storage uploads locally and submits action', async () => {
    const http = makeHttp();
    const storage = makeStorage();
    const { getter, signed } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter, undefined, storage);
    const file = new Blob([new Uint8Array([1])], { type: 'image/png' });
    await mod.lazy.create({ title: 'L', priceNear: '5', image: file });
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(signed[0].action.type).toBe('create_lazy_listing');
    expect(
      (
        (signed[0].action as Record<string, unknown>).metadata as Record<
          string,
          unknown
        >
      ).media
    ).toBe('ipfs://bafyUploaded');
  });

  it('purchase routes through /compose/prepare/purchase-lazy-list', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.lazy.purchase('abc');
    expect(prepareBodyFor(http.post, SCARCES_VERBS.PURCHASE_LAZY_LIST)).toEqual(
      { listingId: 'abc' }
    );
  });

  it('cancel routes through /compose/prepare/cancel-lazy-list', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.lazy.cancel('abc');
    expect(prepareBodyFor(http.post, 'cancel-lazy-list')).toEqual({
      listingId: 'abc',
    });
  });
});

describe('ScarcesModule.tokens — lifecycle helpers', () => {
  it('renew', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.tokens.renew('t1', 'col1', 1234);
    expect(prepareBodyFor(http.post, 'renew-token')).toEqual({
      tokenId: 't1',
      collectionId: 'col1',
      newExpiresAt: 1234,
    });
  });

  it('redeem', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.tokens.redeem('t1', 'col1');
    expect(prepareBodyFor(http.post, 'redeem-token')).toEqual({
      tokenId: 't1',
      collectionId: 'col1',
    });
  });

  it('revoke', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.tokens.revoke('t1', 'col1', 'spam');
    expect(prepareBodyFor(http.post, 'revoke-token')).toEqual({
      tokenId: 't1',
      collectionId: 'col1',
      memo: 'spam',
    });
  });

  it('claimRefund', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.tokens.claimRefund('t1', 'col1');
    expect(prepareBodyFor(http.post, 'claim-refund')).toEqual({
      tokenId: 't1',
      collectionId: 'col1',
    });
  });
});

describe('ScarcesModule.collections — management helpers', () => {
  it('updatePrice', async () => {
    const http = makeHttp();
    const { getter, signed } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.collections.updatePrice('col1', '2.5');
    expect(signed[0].depositYocto).toBe('1');
    expect(prepareBodyFor(http.post, 'update-collection-price')).toEqual({
      collectionId: 'col1',
      newPriceNear: '2.5',
    });
  });

  it('updateTiming', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.collections.updateTiming('col1', { startTime: 1, endTime: 2 });
    expect(prepareBodyFor(http.post, 'update-collection-timing')).toEqual({
      collectionId: 'col1',
      startTime: 1,
      endTime: 2,
    });
  });

  it('setAllowlist', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.collections.setAllowlist('col1', [
      { account_id: 'alice.near', allocation: 3 },
    ]);
    expect(prepareBodyFor(http.post, 'set-allowlist')).toEqual({
      collectionId: 'col1',
      entries: [{ account_id: 'alice.near', allocation: 3 }],
    });
  });

  it('removeFromAllowlist', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.collections.removeFromAllowlist('col1', ['a.near', 'b.near']);
    expect(prepareBodyFor(http.post, 'remove-from-allowlist')).toEqual({
      collectionId: 'col1',
      accounts: ['a.near', 'b.near'],
    });
  });

  it('setMetadata', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.collections.setMetadata('col1', '{"x":1}');
    expect(prepareBodyFor(http.post, 'set-collection-metadata')).toEqual({
      collectionId: 'col1',
      metadata: '{"x":1}',
    });
  });

  it('setAppMetadata', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.collections.setAppMetadata('app1', 'col1', null);
    expect(prepareBodyFor(http.post, 'set-collection-app-metadata')).toEqual({
      appId: 'app1',
      collectionId: 'col1',
      metadata: null,
    });
  });

  it('cancel', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.collections.cancel('col1', '0.5', 99);
    expect(prepareBodyFor(http.post, 'cancel-collection')).toEqual({
      collectionId: 'col1',
      refundPerTokenNear: '0.5',
      refundDeadlineNs: 99,
    });
  });

  it('withdrawUnclaimedRefunds', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.collections.withdrawUnclaimedRefunds('col1');
    expect(prepareBodyFor(http.post, 'withdraw-unclaimed-refunds')).toEqual({
      collectionId: 'col1',
    });
  });
});

describe('ScarcesModule.market — management helpers', () => {
  it('updateSalePrice', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.market.updateSalePrice('scarces.near', 't1', '7');
    expect(prepareBodyFor(http.post, 'update-sale-price')).toEqual({
      scarceContractId: 'scarces.near',
      tokenId: 't1',
      priceNear: '7',
    });
  });

  it('delistExternal', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.market.delistExternal('scarces.near', 't1');
    expect(prepareBodyFor(http.post, 'delist-external-scarce')).toEqual({
      scarceContractId: 'scarces.near',
      tokenId: 't1',
    });
  });
});

describe('ScarcesModule.apps', () => {
  it('register', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.apps.register('app1', { primarySaleBps: 250, curated: true });
    expect(prepareBodyFor(http.post, 'register-app')).toEqual({
      appId: 'app1',
      primarySaleBps: 250,
      curated: true,
    });
  });

  it('setConfig', async () => {
    const http = makeHttp();
    const { getter, signed } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.apps.setConfig('app1', { metadata: 'x' });
    expect(signed[0].depositYocto).toBe('1');
    expect(prepareBodyFor(http.post, 'set-app-config')).toEqual({
      appId: 'app1',
      metadata: 'x',
    });
  });

  it('fundPool', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.apps.fundPool('app1');
    expect(prepareBodyFor(http.post, 'fund-app-pool')).toEqual({
      appId: 'app1',
    });
  });

  it('withdrawPool', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.apps.withdrawPool('app1', '1');
    expect(prepareBodyFor(http.post, 'withdraw-app-pool')).toEqual({
      appId: 'app1',
      amountNear: '1',
    });
  });

  it('transferOwnership', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.apps.transferOwnership('app1', 'new.near');
    expect(prepareBodyFor(http.post, 'transfer-app-ownership')).toEqual({
      appId: 'app1',
      newOwner: 'new.near',
    });
  });

  it('addModerator', async () => {
    const http = makeHttp();
    const { getter, signed } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.apps.addModerator('app1', 'mod.near');
    expect(signed[0].depositYocto).toBe('1');
    expect(prepareBodyFor(http.post, 'add-moderator')).toEqual({
      appId: 'app1',
      accountId: 'mod.near',
    });
  });

  it('removeModerator', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.apps.removeModerator('app1', 'mod.near');
    expect(prepareBodyFor(http.post, 'remove-moderator')).toEqual({
      appId: 'app1',
      accountId: 'mod.near',
    });
  });

  it('banCollection', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.apps.banCollection('app1', 'col1', 'spam');
    expect(prepareBodyFor(http.post, 'ban-collection')).toEqual({
      appId: 'app1',
      collectionId: 'col1',
      reason: 'spam',
    });
  });

  it('unbanCollection', async () => {
    const http = makeHttp();
    const { getter } = makeSessionGetter();
    const mod = new ScarcesModule(asHttp(http), getter);
    await mod.apps.unbanCollection('app1', 'col1');
    expect(prepareBodyFor(http.post, 'unban-collection')).toEqual({
      appId: 'app1',
      collectionId: 'col1',
    });
  });
});
