/**
 * Tests for compose Mint operations: composeMint, buildMintAction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mockUploadBuffer,
  mockFetch,
  mockUploadText,
  mockLighthouseUpload,
  mockLighthouseText,
  mockRelaySuccess,
  mockRelayFailure,
  makeFile,
} from './helpers.js';
import {
  composeMint,
  buildMintAction,
  ComposeError,
} from '../../../src/services/compose/index.js';
import { config } from '../../../src/config/index.js';

describe('composeMint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mints NFT with image upload', async () => {
    mockLighthouseUpload('QmArtCid', 50000);
    mockLighthouseText('QmMetaCid', 300);
    mockRelaySuccess('tx_mint');

    const result = await composeMint(
      'alice.testnet',
      { title: 'Sunset Art', description: 'A sunset' },
      makeFile()
    );

    expect(result.txHash).toBe('tx_mint');
    expect(result.media!.cid).toBe('QmArtCid');
    expect(result.metadata!.cid).toBe('QmMetaCid');

    // Verify relay action — ScarceOptions fields are flattened at root
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.type).toBe('quick_mint');
    expect(body.action.metadata.title).toBe('Sunset Art');
    expect(body.action.metadata.description).toBe('A sunset');
    expect(body.action.metadata.media).toBe('ipfs://QmArtCid');
    expect(body.action.metadata.media_hash).toBeTruthy();
    expect(body.action.metadata.reference).toBe('ipfs://QmMetaCid');
    expect(body.action.metadata.reference_hash).toBeTruthy();
    // No nested options object
    expect(body.action.options).toBeUndefined();
  });

  it('mints NFT without image (skipAutoMedia)', async () => {
    mockLighthouseText('QmMetaOnly', 100);
    mockRelaySuccess('tx_mint_noimg');

    const result = await composeMint(
      'alice.testnet',
      { title: 'Text NFT', skipAutoMedia: true },
      undefined
    );

    expect(result.txHash).toBe('tx_mint_noimg');
    expect(result.media).toBeUndefined();
    expect(result.metadata!.cid).toBe('QmMetaOnly');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.metadata.media).toBeUndefined();
    expect(body.action.metadata.reference).toBe('ipfs://QmMetaOnly');
  });

  it('auto-generates a typographic text-card SVG when no image and not opted out', async () => {
    // Two uploadText calls: first SVG, then metadata JSON.
    mockUploadText
      .mockResolvedValueOnce({ data: { Hash: 'QmAutoCardSvg', Size: 1234 } })
      .mockResolvedValueOnce({ data: { Hash: 'QmAutoMeta', Size: 256 } });
    mockRelaySuccess('tx_mint_autocard');

    const result = await composeMint(
      'alice.testnet',
      { title: 'Just Words' },
      undefined
    );

    expect(result.txHash).toBe('tx_mint_autocard');
    expect(result.media!.cid).toBe('QmAutoCardSvg');
    expect(result.metadata!.cid).toBe('QmAutoMeta');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.metadata.media).toBe('ipfs://QmAutoCardSvg');
    expect(body.action.metadata.reference).toBe('ipfs://QmAutoMeta');

    // The first uploadText call should be the SVG card; verify shape.
    const svgArg = mockUploadText.mock.calls[0][0] as string;
    expect(svgArg).toContain('<svg');
    expect(svgArg).toContain('Just Words');
    // Author defaults to caller accountId when no creator is supplied.
    expect(svgArg).toContain('@alice.testnet');
    // No platform branding on the visual.
    expect(svgArg).not.toContain('OnSocial');
    const filename = mockUploadText.mock.calls[0][2];
    expect(filename).toBe('card.svg');
  });

  it('renders the supplied creator displayName on the auto-card', async () => {
    mockUploadText
      .mockResolvedValueOnce({ data: { Hash: 'QmCard2', Size: 1234 } })
      .mockResolvedValueOnce({ data: { Hash: 'QmMeta2', Size: 256 } });
    mockRelaySuccess('tx_mint_creator');

    await composeMint(
      'alice.testnet',
      {
        title: 'A thought',
        creator: { accountId: 'alice.near', displayName: 'Alice Smith' },
      },
      undefined
    );

    const svgArg = mockUploadText.mock.calls[0][0] as string;
    expect(svgArg).toContain('Alice Smith');
    expect(svgArg).toContain('@alice.near');
  });

  it('includes royalty in QuickMint (flattened)', async () => {
    mockLighthouseText('QmM', 50);
    mockRelaySuccess();

    await composeMint(
      'alice.testnet',
      { title: 'Royalty NFT', royalty: { 'artist.testnet': 2500 } },
      undefined
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.type).toBe('quick_mint');
    expect(body.action.royalty).toEqual({ 'artist.testnet': 2500 });
    // Flattened → no options wrapper
    expect(body.action.options).toBeUndefined();
  });

  it('uses MintFromCollection when collectionId provided', async () => {
    mockRelaySuccess();

    await composeMint(
      'alice.testnet',
      { title: 'Collection Item', collectionId: 'col-001', quantity: 3 },
      undefined
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.type).toBe('mint_from_collection');
    expect(body.action.collection_id).toBe('col-001');
    expect(body.action.quantity).toBe(3);
    // MintFromCollection has NO metadata or price — those live on the collection
    expect(body.action.metadata).toBeUndefined();
    expect(body.action.price).toBeUndefined();
  });

  it('MintFromCollection defaults quantity to 1', async () => {
    mockRelaySuccess();

    await composeMint(
      'alice.testnet',
      { title: 'ignored for collection', collectionId: 'col-002' },
      undefined
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.quantity).toBe(1);
  });

  it('MintFromCollection skips Lighthouse upload', async () => {
    mockRelaySuccess();

    await composeMint(
      'alice.testnet',
      { title: 'ignored', collectionId: 'col-003' },
      undefined
    );

    // No Lighthouse calls — collection mint uses pre-configured metadata
    expect(mockUploadBuffer).not.toHaveBeenCalled();
  });

  it('MintFromCollection ignores image file even if provided', async () => {
    mockRelaySuccess();

    const result = await composeMint(
      'alice.testnet',
      { title: 'ignored', collectionId: 'col-003' },
      {
        fieldname: 'image',
        originalname: 'photo.png',
        buffer: Buffer.from('img'),
        mimetype: 'image/png',
        size: 3,
      }
    );

    // Image should NOT be uploaded for collection mints
    expect(mockUploadBuffer).not.toHaveBeenCalled();
    expect(result.media).toBeUndefined();
  });

  it('MintFromCollection passes receiver_id', async () => {
    mockRelaySuccess();

    await composeMint(
      'alice.testnet',
      { title: 'Gift', collectionId: 'col-004', receiverId: 'bob.testnet' },
      undefined
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.receiver_id).toBe('bob.testnet');
  });

  it('includes copies in metadata', async () => {
    mockLighthouseText('QmCopies', 50);
    mockRelaySuccess();

    await composeMint(
      'alice.testnet',
      { title: 'Edition', copies: 100 },
      undefined
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.metadata.copies).toBe(100);
  });

  it('includes extra metadata', async () => {
    mockLighthouseText('QmExtra', 100);
    mockRelaySuccess();

    await composeMint(
      'alice.testnet',
      {
        title: 'Rich NFT',
        extra: {
          rarity: 'legendary',
          attributes: [{ trait: 'color', value: 'gold' }],
        },
      },
      undefined
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.metadata.extra).toBe(
      JSON.stringify({
        rarity: 'legendary',
        attributes: [{ trait: 'color', value: 'gold' }],
      })
    );
  });

  it('targets scarces.onsocial.testnet by default', async () => {
    mockLighthouseText('QmT', 50);
    mockRelaySuccess();

    await composeMint('alice.testnet', { title: 'Test' }, undefined);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.target_account).toBe('scarces.onsocial.testnet');
  });

  it('targets scarces.onsocial.near on mainnet', async () => {
    const orig = config.nearNetwork;
    (config as Record<string, unknown>).nearNetwork = 'mainnet';

    mockLighthouseText('QmMain', 50);
    mockRelaySuccess();

    await composeMint('alice.near', { title: 'Mainnet' }, undefined);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.target_account).toBe('scarces.onsocial.near');

    (config as Record<string, unknown>).nearNetwork = orig;
  });

  it('allows custom targetAccount override', async () => {
    mockLighthouseText('QmT', 50);
    mockRelaySuccess();

    await composeMint(
      'alice.testnet',
      { title: 'Test', targetAccount: 'custom-nft.testnet' },
      undefined
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.target_account).toBe('custom-nft.testnet');
  });

  it('throws ComposeError on relay failure', async () => {
    mockLighthouseText('QmFail', 50);
    mockRelayFailure(500, 'Mint failed');

    await expect(
      composeMint('alice.testnet', { title: 'Fail' }, undefined)
    ).rejects.toThrow(ComposeError);
  });
});

describe('buildMintAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds QuickMint action with image upload', async () => {
    mockLighthouseUpload('QmPrepArt', 5000);
    mockLighthouseText('QmPrepMeta', 300);

    const result = await buildMintAction(
      'alice.testnet',
      { title: 'Sunset', description: 'A sunset' },
      makeFile()
    );

    expect(result.action).toMatchObject({
      type: 'quick_mint',
      metadata: {
        title: 'Sunset',
        description: 'A sunset',
        media: 'ipfs://QmPrepArt',
        reference: 'ipfs://QmPrepMeta',
      },
    });
    expect(result.media!.cid).toBe('QmPrepArt');
    expect(result.metadata!.cid).toBe('QmPrepMeta');
    expect(result.targetAccount).toBe('scarces.onsocial.testnet');
    // No relay call
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('builds MintFromCollection action without uploads', async () => {
    const result = await buildMintAction(
      'alice.testnet',
      { title: 'ignored', collectionId: 'col-001', quantity: 5 },
      undefined
    );

    expect(result.action).toEqual({
      type: 'mint_from_collection',
      collection_id: 'col-001',
      quantity: 5,
    });
    expect(result.media).toBeUndefined();
    expect(result.metadata).toBeUndefined();
    expect(mockUploadBuffer).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('respects targetAccount override', async () => {
    mockLighthouseText('QmT', 50);

    const result = await buildMintAction(
      'alice.testnet',
      { title: 'Test', targetAccount: 'custom-nft.testnet' },
      undefined
    );

    expect(result.targetAccount).toBe('custom-nft.testnet');
  });

  it('includes royalty in QuickMint action', async () => {
    mockLighthouseText('QmR', 50);

    const result = await buildMintAction(
      'alice.testnet',
      { title: 'Royalty', royalty: { 'artist.testnet': 2500 } },
      undefined
    );

    expect(result.action).toMatchObject({
      type: 'quick_mint',
      royalty: { 'artist.testnet': 2500 },
    });
  });

  it('rejects royalty exceeding 50%', async () => {
    await expect(
      buildMintAction(
        'alice.testnet',
        { title: 'Bad', royalty: { 'a.testnet': 5001 } },
        undefined
      )
    ).rejects.toThrow(ComposeError);
  });

  it('rejects royalty with 0 bps share', async () => {
    await expect(
      buildMintAction(
        'alice.testnet',
        { title: 'Bad', royalty: { 'a.testnet': 0 } },
        undefined
      )
    ).rejects.toThrow(ComposeError);
  });

  it('rejects royalty with >10 recipients', async () => {
    const royalty: Record<string, number> = {};
    for (let i = 0; i < 11; i++) royalty[`r${i}.testnet`] = 100;
    await expect(
      buildMintAction('alice.testnet', { title: 'Bad', royalty }, undefined)
    ).rejects.toThrow('Maximum 10 royalty recipients');
  });

  it('rejects MintFromCollection with quantity 0', async () => {
    await expect(
      buildMintAction(
        'alice.testnet',
        { title: 'x', collectionId: 'col', quantity: 0 },
        undefined
      )
    ).rejects.toThrow('Quantity must be 1-10');
  });

  it('rejects MintFromCollection with quantity > 10', async () => {
    await expect(
      buildMintAction(
        'alice.testnet',
        { title: 'x', collectionId: 'col', quantity: 11 },
        undefined
      )
    ).rejects.toThrow('Quantity must be 1-10');
  });
});
