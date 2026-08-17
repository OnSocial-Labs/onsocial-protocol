/**
 * Tests for compose Collection operations: buildCreateCollectionAction, composeCreateCollection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mockUploadBuffer,
  mockUploadDirectory,
  mockFetch,
  mockLighthouseUpload,
  mockLighthouseDirectoryUpload,
  mockUploadNamedBuffer,
  mockRelaySuccess,
  makeFile,
} from './helpers.js';
import {
  buildCreateCollectionAction,
  ComposeError,
} from '../../../src/services/compose/index.js';

// Stub the on-chain profile lookup so auto-card tests don't try to
// hit the NEAR RPC mock and consume mockFetch slots meant for the relay.
vi.mock('../../../src/services/compose/profileLookup.js', () => ({
  getProfileName: vi.fn(async () => ''),
  getProfileAvatar: vi.fn(async () => ''),
  resolveCreatorAvatarDataUri: vi.fn(async () => undefined),
  _resetProfileCache: vi.fn(),
}));

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
    expect(template.media).toBe(
      'https://test-gw.lighthouseweb3.xyz/ipfs/QmCollectionImg'
    );
  });

  it('builds action without image', async () => {
    const result = await buildCreateCollectionAction(
      'creator.testnet',
      {
        collectionId: 'membership',
        totalSupply: 500,
        title: 'Premium Member',
        skipAutoMedia: true,
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

  it('auto-generates text-card cover when no media', async () => {
    mockLighthouseUpload('QmAutoCardCover', 4200);

    const result = await buildCreateCollectionAction(
      'creator.testnet',
      {
        collectionId: 'letter-drop',
        totalSupply: 25,
        title: 'Hello Letter',
        cardFormat: 'letter',
        cardPalette: 'graphite',
      },
      undefined
    );

    expect(result.media).toBeDefined();
    expect(result.media!.cid).toBe('QmAutoCardCover');
    expect(mockUploadNamedBuffer).toHaveBeenCalled();

    const template = JSON.parse(result.action.metadata_template as string);
    expect(template.media).toBe(
      'https://test-gw.lighthouseweb3.xyz/ipfs/QmAutoCardCover'
    );
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
        skipAutoMedia: true,
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
        skipAutoMedia: true,
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

  it('stamps drop provenance into the token extra', async () => {
    const result = await buildCreateCollectionAction(
      'creator.testnet',
      {
        collectionId: 'ink-studies-1',
        totalSupply: 10,
        title: 'Ink Study',
        metadata: JSON.stringify({
          series: { id: 'ink-studies', title: 'Ink Studies' },
          cover: { seat: 2 },
        }),
        extra: { kind: 'art' },
        skipAutoMedia: true,
      },
      undefined
    );

    const template = JSON.parse(result.action.metadata_template as string);
    const extra = JSON.parse(template.extra as string);
    // Caller extra passes through; provenance fields are added.
    expect(extra.kind).toBe('art');
    expect(extra.collection).toEqual({
      id: 'ink-studies-1',
      title: 'Ink Study',
    });
    expect(extra.series).toEqual({ id: 'ink-studies', title: 'Ink Studies' });
    expect(extra.creator).toBe('creator.testnet');
  });

  it('stamps provenance without series and overrides spoofed creator', async () => {
    const result = await buildCreateCollectionAction(
      'creator.testnet',
      {
        collectionId: 'solo-drop',
        totalSupply: 5,
        title: 'Solo',
        extra: { creator: 'evil.testnet' },
        skipAutoMedia: true,
      },
      undefined
    );

    const template = JSON.parse(result.action.metadata_template as string);
    const extra = JSON.parse(template.extra as string);
    expect(extra.collection).toEqual({ id: 'solo-drop', title: 'Solo' });
    expect(extra.series).toBeUndefined();
    // The authenticated account wins over caller-supplied `creator`.
    expect(extra.creator).toBe('creator.testnet');
  });

  it('strips seat placeholders from the provenance collection title', async () => {
    const result = await buildCreateCollectionAction(
      'creator.testnet',
      {
        collectionId: 'gen-set',
        totalSupply: 100,
        title: 'Gen Art',
        variationsCid: 'QmArtDir',
      },
      undefined
    );

    const template = JSON.parse(result.action.metadata_template as string);
    // Token title keeps the per-seat suffix …
    expect(template.title).toBe('Gen Art #{seat_number}');
    // … but provenance names the drop itself.
    const extra = JSON.parse(template.extra as string);
    expect(extra.collection).toEqual({ id: 'gen-set', title: 'Gen Art' });
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
        skipAutoMedia: true,
      },
      undefined
    );

    expect(result.targetAccount).toBe('my-nft.testnet');
  });
});

describe('buildCreateCollectionAction — variation sets', () => {
  beforeEach(() => vi.clearAllMocks());

  const variationFiles = (count: number, mimetype = 'image/png') =>
    Array.from({ length: count }, (_, i) =>
      makeFile({
        fieldname: 'images',
        originalname: `art-${i + 1}.png`,
        mimetype,
      })
    );

  it('uploads a directory and builds a {seat_number} template', async () => {
    mockLighthouseDirectoryUpload('QmVarDir');

    const result = await buildCreateCollectionAction(
      'creator.testnet',
      {
        collectionId: 'ink-studies',
        totalSupply: 3,
        title: 'Ink Study',
        priceNear: '1',
      },
      undefined,
      variationFiles(3)
    );

    expect(result.variations).toBeDefined();
    expect(result.variations!.cid).toBe('QmVarDir');
    expect(result.variations!.count).toBe(3);

    // Files are renamed to their 1-based seat positions.
    const uploaded = mockUploadDirectory.mock.calls[0][0].files;
    expect(uploaded.map((f) => f.filename)).toEqual([
      '1.png',
      '2.png',
      '3.png',
    ]);

    const template = JSON.parse(result.action.metadata_template as string);
    expect(template.media).toBe(
      'https://test-gw.lighthouseweb3.xyz/ipfs/QmVarDir/{seat_number}.png'
    );
    // Per-token media is content-addressed by the directory CID — no hash.
    expect(template.media_hash).toBeUndefined();
    // Each artwork is unique.
    expect(template.copies).toBe(1);
    // Title gets a seat suffix so every token is distinguishable.
    expect(template.title).toBe('Ink Study #{seat_number}');
  });

  it('keeps a caller-provided title placeholder', async () => {
    mockLighthouseDirectoryUpload();

    const result = await buildCreateCollectionAction(
      'creator.testnet',
      {
        collectionId: 'seats',
        totalSupply: 2,
        title: 'Seat {seat_number} of 2',
      },
      undefined,
      variationFiles(2)
    );

    const template = JSON.parse(result.action.metadata_template as string);
    expect(template.title).toBe('Seat {seat_number} of 2');
  });

  it('rejects image count not matching totalSupply', async () => {
    await expect(
      buildCreateCollectionAction(
        'creator.testnet',
        {
          collectionId: 'mismatch',
          totalSupply: 5,
          title: 'Mismatch',
        },
        undefined,
        variationFiles(3)
      )
    ).rejects.toThrow('exactly one image per token');
  });

  it('rejects mixed image formats', async () => {
    const files = [
      makeFile({ fieldname: 'images', mimetype: 'image/png' }),
      makeFile({ fieldname: 'images', mimetype: 'image/jpeg' }),
    ];
    await expect(
      buildCreateCollectionAction(
        'creator.testnet',
        {
          collectionId: 'mixed',
          totalSupply: 2,
          title: 'Mixed',
        },
        undefined,
        files
      )
    ).rejects.toThrow('share one format');
  });

  it('rejects variation images combined with a single cover image', async () => {
    await expect(
      buildCreateCollectionAction(
        'creator.testnet',
        {
          collectionId: 'both',
          totalSupply: 2,
          title: 'Both',
        },
        makeFile(),
        variationFiles(2)
      )
    ).rejects.toThrow('not both');
  });

  it('builds a template from a BYO variationsCid without uploading', async () => {
    const result = await buildCreateCollectionAction(
      'creator.testnet',
      {
        collectionId: 'generative',
        totalSupply: 10000,
        title: 'Gen Art',
        variationsCid: 'QmByoDir',
        variationsExt: 'webp',
      },
      undefined
    );

    expect(mockUploadDirectory).not.toHaveBeenCalled();
    expect(result.variations!.cid).toBe('QmByoDir');

    const template = JSON.parse(result.action.metadata_template as string);
    expect(template.media).toBe(
      'https://test-gw.lighthouseweb3.xyz/ipfs/QmByoDir/{seat_number}.webp'
    );
    expect(template.copies).toBe(1);
  });

  it('rejects variationsCid combined with mediaCid', async () => {
    await expect(
      buildCreateCollectionAction(
        'creator.testnet',
        {
          collectionId: 'conflict',
          totalSupply: 10,
          title: 'Conflict',
          variationsCid: 'QmByoDir',
          mediaCid: 'QmSingle',
        },
        undefined
      )
    ).rejects.toThrow(ComposeError);
  });
});

describe('buildCreateCollectionAction — traits & random assignment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('templates reference from a referenceCid trait directory', async () => {
    const result = await buildCreateCollectionAction(
      'creator.testnet',
      {
        collectionId: 'punks',
        totalSupply: 1000,
        title: 'Punk',
        variationsCid: 'QmArtDir',
        referenceCid: 'QmTraitDir',
      },
      undefined
    );

    expect(result.reference).toBeDefined();
    expect(result.reference!.cid).toBe('QmTraitDir');
    expect(result.reference!.ext).toBe('json');

    const template = JSON.parse(result.action.metadata_template as string);
    expect(template.reference).toBe(
      'https://test-gw.lighthouseweb3.xyz/ipfs/QmTraitDir/{seat_number}.json'
    );
    // Trait JSONs are content-addressed by the directory CID — no hash.
    expect(template.reference_hash).toBeUndefined();
  });

  it('sets random_assignment on the action for variation drops', async () => {
    const result = await buildCreateCollectionAction(
      'creator.testnet',
      {
        collectionId: 'random-punks',
        totalSupply: 1000,
        title: 'Punk',
        variationsCid: 'QmArtDir',
        randomAssignment: true,
      },
      undefined
    );

    expect(result.action.random_assignment).toBe(true);
  });

  it('omits random_assignment unless requested', async () => {
    const result = await buildCreateCollectionAction(
      'creator.testnet',
      {
        collectionId: 'ordered',
        totalSupply: 10,
        title: 'Ordered',
        variationsCid: 'QmArtDir',
      },
      undefined
    );

    expect(result.action.random_assignment).toBeUndefined();
  });

  it('rejects randomAssignment without variations or trait metadata', async () => {
    await expect(
      buildCreateCollectionAction(
        'creator.testnet',
        {
          collectionId: 'pointless',
          totalSupply: 10,
          title: 'Same Art',
          randomAssignment: true,
          skipAutoMedia: true,
        },
        undefined
      )
    ).rejects.toThrow('requires a variation set');
  });

  it('rejects an invalid referenceExt', async () => {
    await expect(
      buildCreateCollectionAction(
        'creator.testnet',
        {
          collectionId: 'badext',
          totalSupply: 10,
          title: 'Bad',
          variationsCid: 'QmArtDir',
          referenceCid: 'QmTraitDir',
          referenceExt: '../evil',
        },
        undefined
      )
    ).rejects.toThrow('Invalid referenceExt');
  });
});
