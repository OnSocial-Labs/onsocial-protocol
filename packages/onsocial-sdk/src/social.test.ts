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
        kind: 'text',
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
    const social = new SocialModule({ post, network: 'mainnet' } as never);

    await social.unstand('bob.near');

    expect(post).toHaveBeenCalledWith('/compose/set', {
      path: 'standing/bob.near',
      targetAccount: 'core.onsocial.near',
      value: null,
    });
  });

  it('preserves null tombstones in generic set', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx' });
    const social = new SocialModule({ post, network: 'mainnet' } as never);

    await social.set('post/p1', null);

    expect(post).toHaveBeenCalledWith('/compose/set', {
      path: 'post/p1',
      targetAccount: 'core.onsocial.near',
      value: null,
    });
  });

  it('uploads avatar File via /storage/upload then writes ipfs:// URL', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx' });
    const requestForm = vi.fn().mockResolvedValue({ cid: 'bafy123' });
    const social = new SocialModule({
      post,
      requestForm,
      network: 'mainnet',
    } as never);

    const file = new Blob(['png-bytes'], { type: 'image/png' });
    await social.setProfile({ name: 'Alice', avatar: file });

    expect(requestForm).toHaveBeenCalledWith(
      'POST',
      '/storage/upload',
      expect.any(FormData)
    );
    expect(post).toHaveBeenCalledWith('/compose/set', {
      path: 'profile',
      targetAccount: 'core.onsocial.near',
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
    const social = new SocialModule({
      post,
      requestForm,
      network: 'mainnet',
    } as never);

    await social.setProfile({ avatar: 'ipfs://existing' });

    expect(requestForm).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith('/compose/set', {
      path: 'profile',
      targetAccount: 'core.onsocial.near',
      value: expect.objectContaining({ 'profile/avatar': 'ipfs://existing' }),
    });
  });

  it('uploads post image and prepends ipfs:// URL into media[]', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx' });
    const requestForm = vi.fn().mockResolvedValue({ cid: 'bafyImg' });
    const social = new SocialModule({
      post,
      requestForm,
      network: 'mainnet',
    } as never);

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
    const social = new SocialModule({
      post,
      requestForm,
      network: 'mainnet',
    } as never);

    await social.post({ text: 'plain' }, 'p2');

    expect(requestForm).not.toHaveBeenCalled();
    const [, body] = post.mock.calls[0];
    expect(JSON.parse(body.value).text).toBe('plain');
  });

  it('reactToPost and unreactFromPost derive the canonical post path', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx' });
    const social = new SocialModule({ post, network: 'mainnet' } as never);

    await social.reactToPost(
      { author: 'alice.near', postId: 'p1' },
      { type: 'like', source: 'feed' }
    );
    await social.unreactFromPost(
      { author: 'alice.near', postId: 'p1' },
      'like'
    );

    expect(post).toHaveBeenNthCalledWith(1, '/compose/set', {
      path: 'reaction/alice.near/like/post/p1',
      targetAccount: 'core.onsocial.near',
      value: JSON.stringify({ v: 1, type: 'like', source: 'feed' }),
    });
    expect(post).toHaveBeenNthCalledWith(2, '/compose/set', {
      path: 'reaction/alice.near/like/post/p1',
      targetAccount: 'core.onsocial.near',
      value: null,
    });
  });

  it('replyToPost and quotePost reuse the post reference helpers', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx' });
    const social = new SocialModule({ post, network: 'mainnet' } as never);

    await social.replyToPost(
      { author: 'alice.near', postId: '42' },
      { text: 'Reply' },
      'r1'
    );
    await social.quotePost(
      { author: 'alice.near', postId: '42' },
      { text: 'Quote' },
      'q1'
    );

    expect(post).toHaveBeenNthCalledWith(
      1,
      '/compose/set',
      expect.objectContaining({
        path: 'post/r1',
        targetAccount: 'core.onsocial.near',
      })
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/compose/set',
      expect.objectContaining({
        path: 'post/q1',
        targetAccount: 'core.onsocial.near',
      })
    );

    const replyPayload = JSON.parse(post.mock.calls[0][1].value);
    const quotePayload = JSON.parse(post.mock.calls[1][1].value);

    expect(replyPayload).toEqual({
      v: 1,
      text: 'Reply',
      kind: 'text',
      parent: 'alice.near/post/42',
      parentType: 'post',
      timestamp: expect.any(Number),
    });
    expect(quotePayload).toEqual({
      v: 1,
      text: 'Quote',
      kind: 'text',
      ref: 'alice.near/post/42',
      refType: 'quote',
      timestamp: expect.any(Number),
    });
  });

  it('parses typed social direct reads', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        requested_key: 'saved/alice.near/post/123',
        full_key: 'alice.near/saved/alice.near/post/123',
        value: JSON.stringify({
          v: 1,
          timestamp: 1710000000000,
          folder: 'reads',
        }),
        deleted: false,
        corrupted: false,
      })
      .mockResolvedValueOnce({
        requested_key: 'endorsement/bob.near/rust',
        full_key: 'alice.near/endorsement/bob.near/rust',
        value: { v: 1, since: 1710000001000, topic: 'rust', weight: 5 },
        deleted: false,
        corrupted: false,
      })
      .mockResolvedValueOnce({
        requested_key: 'claims/bob.near/skill/claim-1',
        full_key: 'alice.near/claims/bob.near/skill/claim-1',
        value: JSON.stringify({ v: 1, issuedAt: 1710000002000, scope: 'core' }),
        deleted: false,
        corrupted: false,
      });
    const social = new SocialModule({ get, network: 'mainnet' } as never);

    await expect(
      social.getSave('alice.near/post/123', 'alice.near')
    ).resolves.toEqual({
      contentPath: 'alice.near/post/123',
      v: 1,
      timestamp: 1710000000000,
      folder: 'reads',
    });
    await expect(
      social.getEndorsement('bob.near', {
        topic: 'rust',
        accountId: 'alice.near',
      })
    ).resolves.toEqual({
      target: 'bob.near',
      v: 1,
      since: 1710000001000,
      topic: 'rust',
      weight: 5,
    });
    await expect(
      social.getAttestation('bob.near', 'skill', 'claim-1', 'alice.near')
    ).resolves.toEqual({
      claimId: 'claim-1',
      subject: 'bob.near',
      type: 'skill',
      v: 1,
      issuedAt: 1710000002000,
      scope: 'core',
    });

    expect(get).toHaveBeenNthCalledWith(
      1,
      '/data/get-one?key=saved%2Falice.near%2Fpost%2F123&accountId=alice.near'
    );
    expect(get).toHaveBeenNthCalledWith(
      2,
      '/data/get-one?key=endorsement%2Fbob.near%2Frust&accountId=alice.near'
    );
    expect(get).toHaveBeenNthCalledWith(
      3,
      '/data/get-one?key=claims%2Fbob.near%2Fskill%2Fclaim-1&accountId=alice.near'
    );
  });

  it('returns null for deleted structured entries', async () => {
    const get = vi.fn().mockResolvedValue({
      requested_key: 'saved/alice.near/post/123',
      full_key: 'alice.near/saved/alice.near/post/123',
      value: null,
      deleted: true,
      corrupted: false,
    });
    const social = new SocialModule({ get, network: 'mainnet' } as never);

    await expect(
      social.getSave('alice.near/post/123', 'alice.near')
    ).resolves.toBeNull();
  });
});
