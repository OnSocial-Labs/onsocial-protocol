import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be before imports
// ---------------------------------------------------------------------------

vi.mock('@lighthouse-web3/sdk', () => ({
  default: {
    uploadBuffer: vi.fn(),
    uploadText: vi.fn(),
  },
}));

vi.mock('../../src/config/index.js', () => ({
  config: {
    lighthouseApiKey: 'test-lighthouse-key',
    relayUrl: 'http://localhost:3030',
    relayApiKey: 'test-relay-key',
    nearNetwork: 'testnet',
    jwtSecret: 'test-secret',
  },
}));

vi.mock('../../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import lighthouse from '@lighthouse-web3/sdk';
import {
  uploadToLighthouse,
  uploadJsonToLighthouse,
  composeSet,
  composeMint,
  ComposeError,
  type UploadedFile,
} from '../../src/services/compose/index.js';

// Get mock references after import
const mockUploadBuffer = vi.mocked(lighthouse.uploadBuffer);
const mockUploadText = vi.mocked(lighthouse.uploadText);

// Mock global fetch for relay calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    fieldname: 'image',
    originalname: 'photo.jpg',
    buffer: Buffer.from('fake-image-data'),
    mimetype: 'image/jpeg',
    size: 15,
    ...overrides,
  };
}

function mockLighthouseUpload(cid = 'QmTestCid123', size = 15) {
  mockUploadBuffer.mockResolvedValue({ data: { Hash: cid, Size: size } });
}

function mockLighthouseText(cid = 'QmMetaCid456', size = 200) {
  mockUploadText.mockResolvedValue({ data: { Hash: cid, Size: size } });
}

function mockRelaySuccess(txHash = 'tx_abc123') {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ tx_hash: txHash }),
  });
}

function mockRelayFailure(status = 500, error = 'Contract error') {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('uploadToLighthouse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads a file and returns cid, url, size, hash', async () => {
    mockLighthouseUpload('QmPhoto123', 1024);

    const result = await uploadToLighthouse(makeFile());

    expect(mockUploadBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      'test-lighthouse-key',
    );
    expect(result.cid).toBe('QmPhoto123');
    expect(result.size).toBe(1024);
    expect(result.url).toBe('https://gateway.lighthouse.storage/ipfs/QmPhoto123');
    expect(result.hash).toBeTruthy();
    // Hash should be consistent for same content
    const result2 = await uploadToLighthouse(makeFile());
    expect(result2.hash).toBe(result.hash);
  });

  it('throws when lighthouse API key is missing', async () => {
    // Temporarily override config
    const { config } = await import('../../src/config/index.js');
    const origKey = config.lighthouseApiKey;
    (config as Record<string, unknown>).lighthouseApiKey = '';

    await expect(uploadToLighthouse(makeFile())).rejects.toThrow(
      'LIGHTHOUSE_API_KEY not configured',
    );

    (config as Record<string, unknown>).lighthouseApiKey = origKey;
  });
});

describe('uploadJsonToLighthouse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads JSON and returns cid + hash', async () => {
    mockLighthouseText('QmJsonCid789', 42);

    const result = await uploadJsonToLighthouse({ name: 'Test', value: 123 });

    expect(mockUploadText).toHaveBeenCalledWith(
      JSON.stringify({ name: 'Test', value: 123 }),
      'test-lighthouse-key',
      'metadata.json',
    );
    expect(result.cid).toBe('QmJsonCid789');
    expect(result.size).toBe(42);
    expect(result.url).toBe('https://gateway.lighthouse.storage/ipfs/QmJsonCid789');
    expect(result.hash).toBeTruthy();
  });
});

describe('composeSet', () => {
  beforeEach(() => vi.clearAllMocks());

  it('relays a Set action without files', async () => {
    mockRelaySuccess('tx_set_no_file');

    const result = await composeSet(
      'alice.testnet',
      { path: 'profile/bio', value: { text: 'Developer' } },
      [],
    );

    expect(result.txHash).toBe('tx_set_no_file');
    expect(result.path).toBe('profile/bio');
    expect(Object.keys(result.uploads)).toHaveLength(0);

    // Verify relay was called with correct action
    expect(mockFetch).toHaveBeenCalledOnce();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action).toEqual({
      type: 'set',
      data: { 'profile/bio': { text: 'Developer' } },
    });
    expect(body.auth.actor_id).toBe('alice.testnet');
  });

  it('uploads file and injects CID via mediaField', async () => {
    mockLighthouseUpload('QmPhoto999', 5000);
    mockRelaySuccess('tx_with_media');

    const result = await composeSet(
      'alice.testnet',
      { path: 'post/main', value: { text: 'Hello' }, mediaField: 'image' },
      [makeFile()],
    );

    expect(result.txHash).toBe('tx_with_media');
    expect(result.uploads['image']).toBeDefined();
    expect(result.uploads['image'].cid).toBe('QmPhoto999');

    // Verify CID was injected into the value
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const value = body.action.data['post/main'];
    expect(value.text).toBe('Hello');
    expect(value.image).toBe('ipfs://QmPhoto999');
    expect(value.image_hash).toBeTruthy();
  });

  it('auto-injects CIDs using fieldname when no mediaField', async () => {
    mockLighthouseUpload('QmAuto111', 100);
    mockRelaySuccess('tx_auto');

    const file = makeFile({ fieldname: 'photo' });
    const result = await composeSet(
      'alice.testnet',
      { path: 'post/gallery', value: { title: 'Vacation' } },
      [file],
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const value = body.action.data['post/gallery'];
    expect(value.photo).toBe('ipfs://QmAuto111');
    expect(value.photo_hash).toBeTruthy();
    expect(result.uploads['photo'].cid).toBe('QmAuto111');
  });

  it('handles multiple file uploads', async () => {
    let callCount = 0;
    mockUploadBuffer.mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        data: { Hash: `QmMulti${callCount}`, Size: 100 * callCount },
      });
    });
    mockRelaySuccess('tx_multi');

    const files = [
      makeFile({ fieldname: 'front' }),
      makeFile({ fieldname: 'back' }),
    ];

    const result = await composeSet(
      'alice.testnet',
      { path: 'post/product', value: { name: 'Shoe' } },
      files,
    );

    expect(Object.keys(result.uploads)).toHaveLength(2);
    expect(result.uploads['front'].cid).toBe('QmMulti1');
    expect(result.uploads['back'].cid).toBe('QmMulti2');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const value = body.action.data['post/product'];
    expect(value.front).toBe('ipfs://QmMulti1');
    expect(value.back).toBe('ipfs://QmMulti2');
  });

  it('works with group paths', async () => {
    mockRelaySuccess('tx_group');

    await composeSet(
      'alice.testnet',
      { path: 'groups/dao/media/photo1', value: { caption: 'Meeting' } },
      [],
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.data['groups/dao/media/photo1']).toEqual({
      caption: 'Meeting',
    });
  });

  it('works with arbitrary custom paths', async () => {
    mockRelaySuccess('tx_custom');

    await composeSet(
      'alice.testnet',
      {
        path: 'app/recipes/pasta/carbonara',
        value: { ingredients: ['eggs', 'pecorino'] },
      },
      [],
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.data['app/recipes/pasta/carbonara']).toEqual({
      ingredients: ['eggs', 'pecorino'],
    });
  });

  it('forwards targetAccount for cross-account writes', async () => {
    mockRelaySuccess('tx_cross');

    await composeSet(
      'alice.testnet',
      {
        path: 'post/main',
        value: { text: 'On behalf' },
        targetAccount: 'bob.testnet',
      },
      [],
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.target_account).toBe('bob.testnet');
  });

  it('throws ComposeError on relay failure', async () => {
    mockRelayFailure(400, 'Bad action');

    await expect(
      composeSet('alice.testnet', { path: 'post/x', value: {} }, []),
    ).rejects.toThrow(ComposeError);

    try {
      await composeSet('alice.testnet', { path: 'post/x', value: {} }, []);
    } catch (e) {
      expect(e).toBeInstanceOf(ComposeError);
      expect((e as ComposeError).status).toBe(400);
    }
  });

  it('sends relay API key in headers', async () => {
    mockRelaySuccess();

    await composeSet('alice.testnet', { path: 'post/x', value: {} }, []);

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['X-Api-Key']).toBe('test-relay-key');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('calls relay at configured URL', async () => {
    mockRelaySuccess();

    await composeSet('alice.testnet', { path: 'post/x', value: {} }, []);

    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:3030/execute');
  });
});

describe('composeMint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mints NFT with image upload', async () => {
    mockLighthouseUpload('QmArtCid', 50000);
    mockLighthouseText('QmMetaCid', 300);
    mockRelaySuccess('tx_mint');

    const result = await composeMint(
      'alice.testnet',
      { title: 'Sunset Art', description: 'A sunset' },
      makeFile(),
    );

    expect(result.txHash).toBe('tx_mint');
    expect(result.media!.cid).toBe('QmArtCid');
    expect(result.metadata!.cid).toBe('QmMetaCid');

    // Verify relay action
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.type).toBe('quick_mint');
    expect(body.action.metadata.title).toBe('Sunset Art');
    expect(body.action.metadata.description).toBe('A sunset');
    expect(body.action.metadata.media).toBe('ipfs://QmArtCid');
    expect(body.action.metadata.media_hash).toBeTruthy();
    expect(body.action.metadata.reference).toBe('ipfs://QmMetaCid');
    expect(body.action.metadata.reference_hash).toBeTruthy();
  });

  it('mints NFT without image', async () => {
    mockLighthouseText('QmMetaOnly', 100);
    mockRelaySuccess('tx_mint_noimg');

    const result = await composeMint(
      'alice.testnet',
      { title: 'Text NFT' },
      undefined,
    );

    expect(result.txHash).toBe('tx_mint_noimg');
    expect(result.media).toBeUndefined();
    expect(result.metadata!.cid).toBe('QmMetaOnly');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.metadata.media).toBeUndefined();
    expect(body.action.metadata.reference).toBe('ipfs://QmMetaOnly');
  });

  it('includes price in QuickMint options', async () => {
    mockLighthouseText('QmM', 50);
    mockRelaySuccess();

    await composeMint(
      'alice.testnet',
      { title: 'Priced', price: '1000000000000000000000000' },
      undefined,
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.options.price).toBe('1000000000000000000000000');
  });

  it('uses MintFromCollection when collectionId provided', async () => {
    mockLighthouseText('QmCol', 50);
    mockRelaySuccess();

    await composeMint(
      'alice.testnet',
      { title: 'Collection Item', collectionId: 'col-001', price: '500' },
      undefined,
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.type).toBe('mint_from_collection');
    expect(body.action.collection_id).toBe('col-001');
    expect(body.action.price).toBe('500');
  });

  it('includes copies in metadata', async () => {
    mockLighthouseText('QmCopies', 50);
    mockRelaySuccess();

    await composeMint(
      'alice.testnet',
      { title: 'Edition', copies: 100 },
      undefined,
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
        extra: { rarity: 'legendary', attributes: [{ trait: 'color', value: 'gold' }] },
      },
      undefined,
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.metadata.extra).toBe(
      JSON.stringify({ rarity: 'legendary', attributes: [{ trait: 'color', value: 'gold' }] }),
    );
  });

  it('targets scarces.onsocial.testnet by default', async () => {
    mockLighthouseText('QmT', 50);
    mockRelaySuccess();

    await composeMint('alice.testnet', { title: 'Test' }, undefined);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.target_account).toBe('scarces.onsocial.testnet');
  });

  it('allows custom targetAccount override', async () => {
    mockLighthouseText('QmT', 50);
    mockRelaySuccess();

    await composeMint(
      'alice.testnet',
      { title: 'Test', targetAccount: 'custom-nft.testnet' },
      undefined,
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.target_account).toBe('custom-nft.testnet');
  });

  it('throws ComposeError on relay failure', async () => {
    mockLighthouseText('QmFail', 50);
    mockRelayFailure(500, 'Mint failed');

    await expect(
      composeMint('alice.testnet', { title: 'Fail' }, undefined),
    ).rejects.toThrow(ComposeError);
  });
});

describe('ComposeError', () => {
  it('captures status and details', () => {
    const err = new ComposeError(422, { error: 'Invalid path' });
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ error: 'Invalid path' });
    expect(err.name).toBe('ComposeError');
    expect(err.message).toContain('Invalid path');
  });

  it('handles string details', () => {
    const err = new ComposeError(400, 'Bad request');
    expect(err.message).toBe('Bad request');
  });
});
