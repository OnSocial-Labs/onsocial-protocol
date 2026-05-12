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
  buildMintAction,
  ComposeError,
} from '../../../src/services/compose/index.js';
import { config } from '../../../src/config/index.js';

// Stub the on-chain profile lookup so auto-card tests don't try to
// hit the NEAR RPC mock and consume mockFetch slots meant for the relay.
vi.mock('../../../src/services/compose/profileLookup.js', () => ({
  getProfileName: vi.fn(async () => ''),
  _resetProfileCache: vi.fn(),
}));

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
        media: 'https://test-gw.lighthouseweb3.xyz/ipfs/QmPrepArt',
        reference: 'https://test-gw.lighthouseweb3.xyz/ipfs/QmPrepMeta',
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
