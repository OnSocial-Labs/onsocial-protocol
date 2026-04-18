import { describe, expect, it, vi } from 'vitest';
import {
  SocialModule,
  buildPostSetData,
  buildProfileSetData,
  buildReactionSetData,
  buildStandingRemoveData,
  buildStandingSetData,
} from './social.js';

describe('social set-data builders', () => {
  it('builds flat profile data with encoded complex fields', () => {
    expect(
      buildProfileSetData({
        name: 'Alice',
        bio: 'Builder',
        links: { github: 'alice' },
        tags: ['near', 'social'],
        status: { mood: 'online' },
      })
    ).toEqual({
      'profile/v': '1',
      'profile/name': 'Alice',
      'profile/bio': 'Builder',
      'profile/links': JSON.stringify({ github: 'alice' }),
      'profile/tags': JSON.stringify(['near', 'social']),
      'profile/status': JSON.stringify({ mood: 'online' }),
    });
  });

  it('builds flat post data with a deterministic timestamp', () => {
    expect(buildPostSetData({ text: 'Hello' }, '123', 42)).toEqual({
      'post/123': {
        v: 1,
        text: 'Hello',
        timestamp: 42,
      },
    });
  });

  it('builds standing set and remove data', () => {
    expect(buildStandingSetData('bob.near', 77)).toEqual({
      'standing/bob.near': { v: 1, since: 77 },
    });
    expect(buildStandingRemoveData('bob.near')).toEqual({
      'standing/bob.near': null,
    });
  });

  it('builds reaction data at the canonical content path', () => {
    expect(
      buildReactionSetData('bob.near', 'post/123', { type: 'like' })
    ).toEqual({
      'reaction/bob.near/like/post/123': { v: 1, type: 'like' },
    });
  });
});

describe('SocialModule transport', () => {
  it('sends null removal for unstand', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx' });
    const social = new SocialModule({ post } as never);

    await social.unstand('bob.near');

    expect(post).toHaveBeenCalledWith('/compose/set', {
      path: 'standing/bob.near',
      value: 'null',
    });
  });

  it('uploads avatar File via /storage/upload then writes ipfs:// URL', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx' });
    const requestForm = vi.fn().mockResolvedValue({ cid: 'bafy123' });
    const social = new SocialModule({ post, requestForm } as never);

    const file = new Blob(['png-bytes'], { type: 'image/png' });
    await social.setProfile({ name: 'Alice', avatar: file });

    expect(requestForm).toHaveBeenCalledWith(
      'POST',
      '/storage/upload',
      expect.any(FormData)
    );
    expect(post).toHaveBeenCalledWith('/compose/set', {
      path: 'profile',
      value: expect.objectContaining({
        'profile/v': '1',
        'profile/name': 'Alice',
        'profile/avatar': 'ipfs://bafy123',
      }),
    });
  });

  it('passes through avatar string without uploading', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx' });
    const requestForm = vi.fn();
    const social = new SocialModule({ post, requestForm } as never);

    await social.setProfile({ avatar: 'ipfs://existing' });

    expect(requestForm).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith('/compose/set', {
      path: 'profile',
      value: expect.objectContaining({ 'profile/avatar': 'ipfs://existing' }),
    });
  });

  it('uploads post image and prepends ipfs:// URL into media[]', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx' });
    const requestForm = vi.fn().mockResolvedValue({ cid: 'bafyImg' });
    const social = new SocialModule({ post, requestForm } as never);

    const file = new Blob(['img'], { type: 'image/png' });
    await social.post(
      { text: 'gm', image: file, media: ['ipfs://existing'] },
      'p1'
    );

    expect(requestForm).toHaveBeenCalledWith(
      'POST',
      '/storage/upload',
      expect.any(FormData)
    );
    const [, body] = post.mock.calls[0];
    expect(body.path).toBe('post/p1');
    const stored = JSON.parse(body.value);
    expect(stored.text).toBe('gm');
    expect(stored.media).toEqual(['ipfs://bafyImg', 'ipfs://existing']);
    expect(stored.image).toBeUndefined();
  });

  it('post without image skips upload', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx' });
    const requestForm = vi.fn();
    const social = new SocialModule({ post, requestForm } as never);

    await social.post({ text: 'plain' }, 'p2');

    expect(requestForm).not.toHaveBeenCalled();
    const [, body] = post.mock.calls[0];
    expect(JSON.parse(body.value).text).toBe('plain');
  });
});
