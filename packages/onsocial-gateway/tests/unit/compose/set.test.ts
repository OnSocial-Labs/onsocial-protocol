/**
 * Tests for compose Set operations: composeSet, buildSetAction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mockUploadBuffer,
  mockFetch,
  mockLighthouseUpload,
  mockRelaySuccess,
  mockRelayFailure,
  makeFile,
} from './helpers.js';
import {
  composeSet,
  buildSetAction,
  validatePath,
  ComposeError,
} from '../../../src/services/compose/index.js';

describe('composeSet', () => {
  beforeEach(() => vi.clearAllMocks());

  it('relays a Set action without files', async () => {
    mockRelaySuccess('tx_set_no_file');

    const result = await composeSet(
      'alice.testnet',
      { path: 'profile/bio', value: { text: 'Developer' } },
      []
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
      [makeFile()]
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
      [file]
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
      files
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
      []
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
      []
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
      []
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.target_account).toBe('bob.testnet');
  });

  it('throws ComposeError on relay failure', async () => {
    mockRelayFailure(400, 'Bad action');

    await expect(
      composeSet('alice.testnet', { path: 'post/x', value: {} }, [])
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

  it('rejects path exceeding max length', async () => {
    const longPath = 'a'.repeat(257);
    await expect(
      composeSet('alice.testnet', { path: longPath, value: {} }, [])
    ).rejects.toThrow(ComposeError);
  });

  it('rejects path exceeding max depth', async () => {
    const deepPath = Array.from({ length: 13 }, (_, i) => `s${i}`).join('/');
    await expect(
      composeSet('alice.testnet', { path: deepPath, value: {} }, [])
    ).rejects.toThrow(ComposeError);
  });

  it('rejects path with empty segments', async () => {
    await expect(
      composeSet('alice.testnet', { path: 'post//main', value: {} }, [])
    ).rejects.toThrow(ComposeError);
  });

  it('allows trailing slash (subtree-style path)', async () => {
    mockRelaySuccess('tx_trailing');
    const result = await composeSet(
      'alice.testnet',
      { path: 'post/main/', value: { text: 'ok' } },
      []
    );
    expect(result.txHash).toBe('tx_trailing');
  });

  it('rejects empty path', async () => {
    await expect(
      composeSet('alice.testnet', { path: '', value: {} }, [])
    ).rejects.toThrow(ComposeError);
  });

  it('rejects path with traversal (..) segments', async () => {
    await expect(
      composeSet('alice.testnet', { path: 'post/../secret', value: {} }, [])
    ).rejects.toThrow(ComposeError);
  });

  it('rejects path with backslash', async () => {
    await expect(
      composeSet('alice.testnet', { path: 'post\\main', value: {} }, [])
    ).rejects.toThrow(ComposeError);
  });

  it('rejects path with dot-segment', async () => {
    await expect(
      composeSet('alice.testnet', { path: './post/main', value: {} }, [])
    ).rejects.toThrow(ComposeError);
  });

  it('rejects path with disallowed characters', async () => {
    await expect(
      composeSet('alice.testnet', { path: 'post/<script>', value: {} }, [])
    ).rejects.toThrow(ComposeError);
  });

  it('rejects bare "groups" path', async () => {
    await expect(
      composeSet('alice.testnet', { path: 'groups', value: {} }, [])
    ).rejects.toThrow(ComposeError);
  });

  it('uploads files in parallel', async () => {
    const uploadOrder: number[] = [];
    let callIdx = 0;
    mockUploadBuffer.mockImplementation(() => {
      const idx = ++callIdx;
      uploadOrder.push(idx);
      return Promise.resolve({ data: { Hash: `QmPar${idx}`, Size: 100 } });
    });
    mockRelaySuccess();

    const files = [
      makeFile({ fieldname: 'a' }),
      makeFile({ fieldname: 'b' }),
      makeFile({ fieldname: 'c' }),
    ];
    await composeSet('alice.testnet', { path: 'post/x', value: {} }, files);

    // All 3 uploads should have been initiated
    expect(mockUploadBuffer).toHaveBeenCalledTimes(3);
  });
});

describe('buildSetAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds action without files and does not call relay', async () => {
    const result = await buildSetAction(
      'alice.testnet',
      { path: 'profile/bio', value: { text: 'Developer' } },
      []
    );

    expect(result.action).toEqual({
      type: 'set',
      data: { 'profile/bio': { text: 'Developer' } },
    });
    expect(result.targetAccount).toBe('alice.testnet');
    expect(Object.keys(result.uploads)).toHaveLength(0);
    // No relay call
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uploads files and injects CIDs into the action', async () => {
    mockLighthouseUpload('QmPrepCid', 2000);

    const result = await buildSetAction(
      'alice.testnet',
      { path: 'post/main', value: { text: 'Hello' }, mediaField: 'image' },
      [makeFile()]
    );

    expect(result.uploads['image'].cid).toBe('QmPrepCid');
    const value = (
      result.action as { data: Record<string, Record<string, unknown>> }
    ).data['post/main'];
    expect(value.image).toBe('ipfs://QmPrepCid');
    expect(value.image_hash).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('respects targetAccount override', async () => {
    const result = await buildSetAction(
      'alice.testnet',
      { path: 'post/x', value: {}, targetAccount: 'bob.testnet' },
      []
    );

    expect(result.targetAccount).toBe('bob.testnet');
  });

  it('validates path (rejects invalid paths)', async () => {
    await expect(
      buildSetAction('alice.testnet', { path: 'post//main', value: {} }, [])
    ).rejects.toThrow(ComposeError);
  });
});

describe('validatePath', () => {
  it('accepts valid simple path', () => {
    expect(validatePath('post/main')).toBeNull();
  });

  it('accepts valid deep path', () => {
    expect(validatePath('app/recipes/pasta/carbonara')).toBeNull();
  });

  it('accepts trailing slash', () => {
    expect(validatePath('post/main/')).toBeNull();
  });

  it('accepts group path', () => {
    expect(validatePath('groups/dao/media/photo1')).toBeNull();
  });

  it('rejects empty path', () => {
    expect(validatePath('')).toBeTruthy();
  });

  it('rejects path starting with /', () => {
    expect(validatePath('/post/main')).toBeTruthy();
  });

  it('rejects traversal ..', () => {
    expect(validatePath('post/../secret')).toBeTruthy();
  });

  it('rejects backslash', () => {
    expect(validatePath('post\\main')).toBeTruthy();
  });

  it('rejects dot-segment at start', () => {
    expect(validatePath('./post')).toBeTruthy();
  });

  it('rejects dot-segment in middle', () => {
    expect(validatePath('post/./main')).toBeTruthy();
  });

  it('rejects dot-segment at end', () => {
    expect(validatePath('post/.')).toBeTruthy();
  });

  it('rejects disallowed characters', () => {
    expect(validatePath('post/<script>')).toBeTruthy();
    expect(validatePath('post/hello world')).toBeTruthy();
    expect(validatePath('post/@mention')).toBeTruthy();
  });

  it('rejects consecutive slashes', () => {
    expect(validatePath('post//main')).toBeTruthy();
  });

  it('rejects bare groups', () => {
    expect(validatePath('groups')).toBeTruthy();
    expect(validatePath('groups/')).toBeTruthy();
  });

  it('checks full-path length with accountId', () => {
    // 256 char path is fine alone but may exceed limit when account is prepended
    const longAccount = 'a'.repeat(200) + '.testnet';
    const path = 'b'.repeat(60); // account (208) + / (1) + path (60) = 269 > 256
    expect(validatePath(path, longAccount)).toBeTruthy();
  });

  it('accepts path when full-path length is within limit', () => {
    // Short account + short path = fine
    expect(validatePath('post/main', 'alice.testnet')).toBeNull();
  });

  it('depth counts account segment for non-group paths', () => {
    // 12 segments in path + 1 for account = 13 > MAX_PATH_DEPTH
    const deepPath = Array.from({ length: 12 }, (_, i) => `s${i}`).join('/');
    expect(validatePath(deepPath, 'alice.testnet')).toBeTruthy();
  });

  it('depth does not add account segment for group paths', () => {
    // groups/... is not prefixed with account; depth counts as-is
    const segs = Array.from({ length: 12 }, (_, i) => `s${i}`);
    const groupPath = 'groups/' + segs.slice(0, 11).join('/');
    expect(validatePath(groupPath)).toBeNull();
  });
});
