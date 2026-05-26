import { describe, expect, it, vi } from 'vitest';
import {
  SocialModule,
  buildPostSetData,
  buildProfileSetData,
  buildReactionSetData,
  buildStandingRemoveData,
  buildStandingSetData,
  buildEndorsementSetData,
  normalizeEndorsementTopic,
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

  it('normalizes endorsement topics before writing path segments', () => {
    expect(normalizeEndorsementTopic('AI Research / Ops!')).toBe(
      'AI-Research-Ops'
    );
    expect(
      buildEndorsementSetData('bob.near', {
        topic: 'AI Research / Ops!',
        note: 'Thoughtful research and clean operational follow-through.',
        now: 42,
      })
    ).toEqual({
      'endorsement/bob.near/AI-Research-Ops': {
        v: 1,
        since: 42,
        topic: 'AI-Research-Ops',
        note: 'Thoughtful research and clean operational follow-through.',
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Transport harness
// ---------------------------------------------------------------------------
//
// SocialModule writes now route through the session-bridge:
//   - single set: /compose/prepare/set then /relay/delegate
//   - multi-entry set: signAndRelay (no prepare)
//
// Tests assert the **prepared body** posted to /compose/prepare/set or the
// **signed action** captured by session.sign() — the two SDK-controlled
// surfaces. The relay/signed call is implicit (covered by session-bridge.test.ts).
// ---------------------------------------------------------------------------

interface HarnessOpts {
  network?: 'mainnet' | 'testnet';
  requestForm?: ReturnType<typeof vi.fn>;
  get?: ReturnType<typeof vi.fn>;
}

function makeHarness(opts: HarnessOpts = {}) {
  const network = opts.network ?? 'mainnet';
  const target =
    network === 'mainnet' ? 'core.onsocial.near' : 'core.onsocial.testnet';
  const signed: Array<{
    action: Record<string, unknown>;
    targetAccount: string;
  }> = [];

  const post = vi.fn(async (path: string, body?: unknown) => {
    if (path.startsWith('/compose/prepare/')) {
      return {
        action: { type: 'set', __body: body },
        target_account: target,
      };
    }
    if (path === '/relay/delegate') return { txHash: 'tx' };
    throw new Error(`unexpected POST ${path}`);
  });

  const session = {
    signComposeDelegate: vi.fn(
      async (args: {
        action: Record<string, unknown>;
        targetContract: string;
      }) => {
        signed.push({
          action: args.action,
          targetAccount: args.targetContract,
        });
        return { base64: 'BASE64_DELEGATE_BLOB', nonce: 1 };
      }
    ),
  };

  const defaultGet = vi.fn(async (path: string) => {
    if (path === '/relay/latest-block') return { block_height: 100 };
    throw new Error(`unexpected GET ${path}`);
  });

  const http: Record<string, unknown> = { post, network, get: defaultGet };
  if (opts.requestForm) http.requestForm = opts.requestForm;
  if (opts.get) http.get = opts.get;

  const social = new SocialModule(http as never, () => session as never);
  return { social, post, signed, target };
}

function findPrepBody(post: ReturnType<typeof vi.fn>) {
  const calls = post.mock.calls as unknown as Array<
    [string, { path: string; value: unknown; targetAccount: string }]
  >;
  const call = calls.find(([p]) => p === '/compose/prepare/set');
  if (!call) throw new Error('no /compose/prepare/set call');
  return call[1];
}

describe('SocialModule transport (session-bridge)', () => {
  it('sends null removal for unstand', async () => {
    const { social, post, target } = makeHarness();
    await social.unstand('bob.near');
    expect(findPrepBody(post)).toEqual({
      path: 'standing/bob.near',
      targetAccount: target,
      value: null,
    });
  });

  it('preserves null tombstones in generic set', async () => {
    const { social, post, target } = makeHarness();
    await social.set('post/p1', null);
    expect(findPrepBody(post)).toEqual({
      path: 'post/p1',
      targetAccount: target,
      value: null,
    });
  });

  it('batches multi-entry set() into a single signed Action::Set', async () => {
    const { social, post, signed, target } = makeHarness();
    await social.set({
      'profile/name': 'Alice',
      'posts/main/p1': { text: 'gm' },
    });
    // No /compose/prepare/set call — the multi-entry path builds the action client-side.
    expect(
      post.mock.calls.find(
        (c) => (c as unknown as [string])[0] === '/compose/prepare/set'
      )
    ).toBeUndefined();
    expect(signed).toEqual([
      {
        action: {
          type: 'set',
          data: {
            'profile/name': 'Alice',
            'posts/main/p1': { text: 'gm' },
          },
        },
        targetAccount: target,
      },
    ]);
  });

  it('single-entry set(object) routes through compose/prepare/set like set(path, value)', async () => {
    const { social, post, target } = makeHarness();
    await social.set({ 'profile/name': 'Alice' });
    expect(findPrepBody(post)).toEqual({
      path: 'profile/name',
      targetAccount: target,
      value: 'Alice',
    });
  });

  it('uploads avatar Blob via /storage/upload then writes ipfs:// URL', async () => {
    const requestForm = vi.fn().mockResolvedValue({ cid: 'bafy123' });
    const { social, post, target } = makeHarness({ requestForm });

    const file = new Blob(['png-bytes'], { type: 'image/png' });
    await social.setProfile({ name: 'Alice', avatar: file });

    expect(requestForm).toHaveBeenCalledWith(
      'POST',
      '/storage/upload',
      expect.any(FormData)
    );
    const body = findPrepBody(post);
    expect(body.path).toBe('profile');
    expect(body.targetAccount).toBe(target);
    expect(body.value).toEqual(
      expect.objectContaining({
        'profile/v': '1',
        'profile/name': 'Alice',
        'profile/avatar': 'ipfs://bafy123',
      })
    );
  });

  it('uploads custom profile Blob fields before writing profile data', async () => {
    const requestForm = vi
      .fn()
      .mockResolvedValueOnce({ cid: 'bafyAvatar' })
      .mockResolvedValueOnce({ cid: 'bafyBanner' })
      .mockResolvedValueOnce({ cid: 'bafyGallery' });
    const { social, post } = makeHarness({ requestForm });

    await social.setProfile({
      avatar: new Blob(['avatar'], { type: 'image/png' }),
      banner: new Blob(['banner'], { type: 'image/png' }),
      galleryCover: new Blob(['cover'], { type: 'image/webp' }),
    });

    expect(requestForm).toHaveBeenCalledTimes(3);
    const body = findPrepBody(post);
    expect(body.value).toEqual(
      expect.objectContaining({
        'profile/avatar': 'ipfs://bafyAvatar',
        'profile/banner': 'ipfs://bafyBanner',
        'profile/galleryCover': 'ipfs://bafyGallery',
      })
    );
  });

  it('passes through avatar string without uploading', async () => {
    const requestForm = vi.fn();
    const { social, post } = makeHarness({ requestForm });
    await social.setProfile({ avatar: 'ipfs://existing' });

    expect(requestForm).not.toHaveBeenCalled();
    const body = findPrepBody(post);
    expect(body.path).toBe('profile');
    expect(body.value).toEqual(
      expect.objectContaining({ 'profile/avatar': 'ipfs://existing' })
    );
  });

  it('uploads post image and prepends ipfs:// URL into media[]', async () => {
    const requestForm = vi.fn().mockResolvedValue({ cid: 'bafyImg' });
    const { social, post } = makeHarness({ requestForm });

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
    const body = findPrepBody(post);
    expect(body.path).toBe('post/p1');
    const stored = JSON.parse(body.value as string);
    expect(stored.text).toBe('gm');
    expect(stored.media).toEqual(['ipfs://bafyImg', 'ipfs://existing']);
    expect(stored.image).toBeUndefined();
  });

  it('post without image skips upload', async () => {
    const requestForm = vi.fn();
    const { social, post } = makeHarness({ requestForm });
    await social.post({ text: 'plain' }, 'p2');

    expect(requestForm).not.toHaveBeenCalled();
    const body = findPrepBody(post);
    expect(JSON.parse(body.value as string).text).toBe('plain');
  });

  it('reactToPost and unreactFromPost derive the canonical post path', async () => {
    const { social, post, target } = makeHarness();

    await social.reactToPost(
      { author: 'alice.near', postId: 'p1' },
      { type: 'like', source: 'feed' }
    );
    await social.unreactFromPost(
      { author: 'alice.near', postId: 'p1' },
      'like'
    );

    const calls = post.mock.calls as unknown as Array<
      [string, { path: string; value: unknown; targetAccount: string }]
    >;
    const prepCalls = calls.filter(([p]) => p === '/compose/prepare/set');
    expect(prepCalls).toHaveLength(2);
    expect(prepCalls[0][1]).toEqual({
      path: 'reaction/alice.near/like/post/p1',
      targetAccount: target,
      value: JSON.stringify({ v: 1, type: 'like', source: 'feed' }),
    });
    expect(prepCalls[1][1]).toEqual({
      path: 'reaction/alice.near/like/post/p1',
      targetAccount: target,
      value: null,
    });
  });

  it('replyToPost and quotePost reuse the post reference helpers', async () => {
    const { social, post, target } = makeHarness();

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

    const calls = post.mock.calls as unknown as Array<
      [string, { path: string; value: string; targetAccount: string }]
    >;
    const prepCalls = calls.filter(([p]) => p === '/compose/prepare/set');
    expect(prepCalls[0][1]).toMatchObject({
      path: 'post/r1',
      targetAccount: target,
    });
    expect(prepCalls[1][1]).toMatchObject({
      path: 'post/q1',
      targetAccount: target,
    });

    expect(JSON.parse(prepCalls[0][1].value)).toEqual({
      v: 1,
      text: 'Reply',
      kind: 'text',
      parent: 'alice.near/post/42',
      parentType: 'post',
      timestamp: expect.any(Number),
    });
    expect(JSON.parse(prepCalls[1][1].value)).toEqual({
      v: 1,
      text: 'Quote',
      kind: 'text',
      ref: 'alice.near/post/42',
      refType: 'quote',
      timestamp: expect.any(Number),
    });
  });
});

describe('SocialModule typed reads', () => {
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
        value: {
          v: 1,
          since: 1710000001000,
          topic: 'rust',
          note: 'shipped cleanly',
        },
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
    const { social } = makeHarness({ get });

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
      note: 'shipped cleanly',
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
    const { social } = makeHarness({ get });

    await expect(
      social.getSave('alice.near/post/123', 'alice.near')
    ).resolves.toBeNull();
  });
});
