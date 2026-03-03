/**
 * Tests for compose Collection operations: buildCreateCollectionAction, composeCreateCollection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mockUploadBuffer,
  mockFetch,
  mockLighthouseUpload,
  mockRelaySuccess,
  makeFile,
} from './helpers.js';
import {
  buildCreateCollectionAction,
  composeCreateCollection,
  ComposeError,
} from '../../../src/services/compose/index.js';

describe('buildCreateCollectionAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds create_collection action with image upload', async () => {
    mockLighthouseUpload('QmCollectionImg', 5000);

    const result = await buildCreateCollectionAction(
      'creator.testnet',
      {
        collectionId: 'nearcon-2026',
        totalSupply: 1000,
        title: 'NEARCON 2026',
        description: 'Conference ticket',
        priceNear: '5',
      },
      makeFile({ originalname: 'cover.png' })
    );

    expect(result.action.type).toBe('create_collection');
    expect(result.action.collection_id).toBe('nearcon-2026');
    expect(result.action.total_supply).toBe(1000);
    expect(result.action.price_near).toBe('5000000000000000000000000');
    expect(result.targetAccount).toBe('scarces.onsocial.testnet');
    expect(result.media).toBeDefined();
    expect(result.media!.cid).toBe('QmCollectionImg');

    // metadata_template should be valid JSON with ipfs CID
    const template = JSON.parse(result.action.metadata_template as string);
    expect(template.title).toBe('NEARCON 2026');
    expect(template.description).toBe('Conference ticket');
    expect(template.media).toBe('ipfs://QmCollectionImg');
  });

  it('builds action without image', async () => {
    const result = await buildCreateCollectionAction(
      'creator.testnet',
      {
        collectionId: 'membership',
        totalSupply: 500,
        title: 'Premium Member',
      },
      undefined
    );

    expect(result.action.type).toBe('create_collection');
    expect(result.action.collection_id).toBe('membership');
    expect(result.action.price_near).toBe('0');
    expect(result.media).toBeUndefined();
    expect(mockUploadBuffer).not.toHaveBeenCalled();

    const template = JSON.parse(result.action.metadata_template as string);
    expect(template.title).toBe('Premium Member');
    expect(template.media).toBeUndefined();
  });

  it('rejects invalid collection ID', async () => {
    await expect(
      buildCreateCollectionAction(
        'creator.testnet',
        {
          collectionId: 'bad:id',
          totalSupply: 100,
          title: 'Test',
          priceNear: '1',
        },
        undefined
      )
    ).rejects.toThrow();
  });

  it('rejects reserved collection IDs', async () => {
    await expect(
      buildCreateCollectionAction(
        'creator.testnet',
        {
          collectionId: 's',
          totalSupply: 100,
          title: 'Test',
          priceNear: '1',
        },
        undefined
      )
    ).rejects.toThrow();
  });

  it('rejects totalSupply exceeding 100 000', async () => {
    await expect(
      buildCreateCollectionAction(
        'creator.testnet',
        {
          collectionId: 'big',
          totalSupply: 100_001,
          title: 'Too Big',
          priceNear: '1',
        },
        undefined
      )
    ).rejects.toThrow('Total supply must be 1-100000');
  });

  it('allows free collection without priceNear', async () => {
    const result = await buildCreateCollectionAction(
      'creator.testnet',
      {
        collectionId: 'freebie',
        totalSupply: 10,
        title: 'Free',
      },
      undefined
    );
    expect(result.action.price_near).toBe('0');
  });

  it('rejects end_time <= start_time', async () => {
    await expect(
      buildCreateCollectionAction(
        'creator.testnet',
        {
          collectionId: 'timed',
          totalSupply: 10,
          title: 'Bad Time',
          startTime: 2000,
          endTime: 1000,
        },
        undefined
      )
    ).rejects.toThrow('End time must be after start time');
  });

  it('rejects royalty exceeding 50%', async () => {
    await expect(
      buildCreateCollectionAction(
        'creator.testnet',
        {
          collectionId: 'royal',
          totalSupply: 10,
          title: 'Bad Royalty',
          royalty: { 'a.testnet': 5001 },
        },
        undefined
      )
    ).rejects.toThrow(ComposeError);
  });

  it('rejects max_per_wallet = 0', async () => {
    await expect(
      buildCreateCollectionAction(
        'creator.testnet',
        {
          collectionId: 'wallet',
          totalSupply: 10,
          title: 'Bad Wallet',
          maxPerWallet: 0,
        },
        undefined
      )
    ).rejects.toThrow('max_per_wallet must be > 0');
  });

  it('rejects dutch auction with start_price <= price_near', async () => {
    await expect(
      buildCreateCollectionAction(
        'creator.testnet',
        {
          collectionId: 'dutch',
          totalSupply: 10,
          title: 'Bad Dutch',
          priceNear: '5',
          startPrice: '5',
          startTime: 1000,
          endTime: 2000,
        },
        undefined
      )
    ).rejects.toThrow('start_price must be greater than price_near');
  });

  it('rejects dutch auction without time window', async () => {
    await expect(
      buildCreateCollectionAction(
        'creator.testnet',
        {
          collectionId: 'dutch2',
          totalSupply: 10,
          title: 'No Time',
          priceNear: '1',
          startPrice: '10',
        },
        undefined
      )
    ).rejects.toThrow('Dutch auction requires both start_time and end_time');
  });

  it('rejects allowlist_price without start_time', async () => {
    await expect(
      buildCreateCollectionAction(
        'creator.testnet',
        {
          collectionId: 'wl',
          totalSupply: 10,
          title: 'No Start',
          priceNear: '1',
          allowlistPrice: '0.5',
        },
        undefined
      )
    ).rejects.toThrow('allowlist_price requires start_time');
  });

  it('rejects allowlist_price = 0 for non-free collection', async () => {
    await expect(
      buildCreateCollectionAction(
        'creator.testnet',
        {
          collectionId: 'wl2',
          totalSupply: 10,
          title: 'Zero WL',
          priceNear: '1',
          allowlistPrice: '0',
          startTime: 1000,
        },
        undefined
      )
    ).rejects.toThrow('allowlist_price must be > 0 unless collection is free');
  });

  it('includes optional fields', async () => {
    const result = await buildCreateCollectionAction(
      'creator.testnet',
      {
        collectionId: 'full-opts',
        totalSupply: 50,
        title: 'Full Options',
        priceNear: '2.5',
        royalty: { 'artist.testnet': 1000 },
        appId: 'myapp.testnet',
        renewable: true,
        maxRedeems: 3,
        mintMode: 'purchase_only',
        maxPerWallet: 2,
        startPrice: '10',
        startTime: 1000,
        endTime: 2000,
      },
      undefined
    );

    expect(result.action.royalty).toEqual({ 'artist.testnet': 1000 });
    expect(result.action.app_id).toBe('myapp.testnet');
    expect(result.action.renewable).toBe(true);
    expect(result.action.max_redeems).toBe(3);
    expect(result.action.mint_mode).toBe('purchase_only');
    expect(result.action.max_per_wallet).toBe(2);
    expect(result.action.start_price).toBe('10000000000000000000000000');
    expect(result.action.price_near).toBe('2500000000000000000000000');
  });

  it('respects targetAccount override', async () => {
    const result = await buildCreateCollectionAction(
      'creator.testnet',
      {
        collectionId: 'custom',
        totalSupply: 10,
        title: 'Custom',
        priceNear: '1',
        targetAccount: 'my-nft.testnet',
      },
      undefined
    );

    expect(result.targetAccount).toBe('my-nft.testnet');
  });
});

describe('composeCreateCollection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates collection and relays via intent auth', async () => {
    mockLighthouseUpload('QmCover', 3000);
    mockRelaySuccess('col_tx_123');

    const result = await composeCreateCollection(
      'creator.testnet',
      {
        collectionId: 'my-collection',
        totalSupply: 100,
        title: 'My Collection',
        priceNear: '1',
      },
      makeFile({ originalname: 'cover.jpg' })
    );

    expect(result.txHash).toBe('col_tx_123');
    expect(result.media).toBeDefined();
    expect(result.media!.cid).toBe('QmCover');

    // Verify relay was called with intent auth
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3030/execute',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"type":"intent"'),
      })
    );
  });
});
