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
  buildSetAction,
  validatePath,
  ComposeError,
} from '../../../src/services/compose/index.js';

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
    expect(result.targetAccount).toBe('core.onsocial.testnet');
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

  it('emits { path: null } data for null tombstone (no relay)', async () => {
    const result = await buildSetAction(
      'alice.testnet',
      { path: 'post/del', value: null },
      []
    );

    expect(result.action).toEqual({
      type: 'set',
      data: { 'post/del': null },
    });
    expect(Object.keys(result.uploads)).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('flattens scattered-key profile data instead of wrapping', async () => {
    const result = await buildSetAction(
      'alice.testnet',
      {
        path: 'profile',
        value: {
          'profile/name': 'Alice',
          'profile/bio': 'Builder',
          'profile/v': '1',
        },
      },
      []
    );

    expect(result.action).toEqual({
      type: 'set',
      data: {
        'profile/name': 'Alice',
        'profile/bio': 'Builder',
        'profile/v': '1',
      },
    });
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
