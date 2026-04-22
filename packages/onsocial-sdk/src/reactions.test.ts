import { describe, expect, it, vi } from 'vitest';
import { ReactionsModule } from './reactions.js';
import type { SocialModule } from './social.js';
import type { QueryModule } from './query.js';

function makeSocial() {
  const reactToPost = vi.fn().mockResolvedValue({ txHash: 'tx-add' });
  const unreactFromPost = vi.fn().mockResolvedValue({ txHash: 'tx-remove' });
  return {
    spies: { reactToPost, unreactFromPost },
    mod: { reactToPost, unreactFromPost } as unknown as SocialModule,
  };
}

function makeQuery(opts: {
  counts?: Record<string, number>;
  viewerKinds?: string[];
}) {
  const getReactionCounts = vi
    .fn()
    .mockResolvedValue({ ...(opts.counts ?? {}), total: 0 });
  const graphql = vi.fn().mockResolvedValue({
    data: {
      reactionsCurrent: (opts.viewerKinds ?? []).map((k) => ({
        reactionKind: k,
        operation: 'set',
      })),
    },
  });
  return {
    spies: { getReactionCounts, graphql },
    mod: { getReactionCounts, graphql } as unknown as QueryModule,
  };
}

const POST = { author: 'alice.near', postId: '123' };

describe('ReactionsModule.add / remove', () => {
  it('add delegates to social.reactToPost with type=kind', async () => {
    const { mod, spies } = makeSocial();
    const r = new ReactionsModule(mod, makeQuery({}).mod);
    await r.add(POST, 'like');
    expect(spies.reactToPost).toHaveBeenCalledWith(
      { author: 'alice.near', postId: '123' },
      { type: 'like' }
    );
  });

  it('add forwards optional emoji passthrough', async () => {
    const { mod, spies } = makeSocial();
    const r = new ReactionsModule(mod, makeQuery({}).mod);
    await r.add(POST, '🔥', { emoji: '🔥' });
    expect(spies.reactToPost).toHaveBeenCalledWith(POST, {
      type: '🔥',
      emoji: '🔥',
    });
  });

  it('remove delegates to social.unreactFromPost', async () => {
    const { mod, spies } = makeSocial();
    const r = new ReactionsModule(mod, makeQuery({}).mod);
    await r.remove(POST, 'like');
    expect(spies.unreactFromPost).toHaveBeenCalledWith(POST, 'like');
  });
});

describe('ReactionsModule.toggle', () => {
  it('adds when viewer has not reacted', async () => {
    const { mod: social, spies } = makeSocial();
    const { mod: query } = makeQuery({
      counts: { like: 5 },
      viewerKinds: [],
    });
    const r = new ReactionsModule(social, query);
    const out = await r.toggle(POST, 'like', { viewer: 'bob.near' });
    expect(out.applied).toBe(true);
    expect(spies.reactToPost).toHaveBeenCalledTimes(1);
    expect(spies.unreactFromPost).not.toHaveBeenCalled();
  });

  it('removes when viewer already reacted with that kind', async () => {
    const { mod: social, spies } = makeSocial();
    const { mod: query } = makeQuery({
      counts: { like: 5 },
      viewerKinds: ['like'],
    });
    const r = new ReactionsModule(social, query);
    const out = await r.toggle(POST, 'like', { viewer: 'bob.near' });
    expect(out.applied).toBe(false);
    expect(spies.unreactFromPost).toHaveBeenCalledTimes(1);
    expect(spies.reactToPost).not.toHaveBeenCalled();
  });
});

describe('ReactionsModule.summary', () => {
  it('returns counts only when no viewer given (no second query)', async () => {
    const { mod: query, spies } = makeQuery({ counts: { like: 5, fire: 2 } });
    const r = new ReactionsModule(makeSocial().mod, query);
    const out = await r.summary(POST);
    expect(out.counts).toEqual({ like: 5, fire: 2, total: 0 });
    expect(out.viewerReacted).toEqual([]);
    expect(spies.graphql).not.toHaveBeenCalled();
  });

  it('combines counts + viewer kinds when viewer given', async () => {
    const { mod: query, spies } = makeQuery({
      counts: { like: 5, fire: 2 },
      viewerKinds: ['like', 'fire'],
    });
    const r = new ReactionsModule(makeSocial().mod, query);
    const out = await r.summary(POST, { viewer: 'bob.near' });
    expect(out.viewerReacted).toEqual(['like', 'fire']);
    expect(spies.graphql).toHaveBeenCalledTimes(1);
    const [{ variables }] = spies.graphql.mock.calls[0];
    expect(variables).toMatchObject({
      viewer: 'bob.near',
      owner: 'alice.near',
      like: '%/post/123',
    });
  });
});
