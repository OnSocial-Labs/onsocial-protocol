import { describe, expect, it, vi } from 'vitest';
import { SavesModule } from './saves.js';
import type { SocialModule } from '../social.js';
import type { QueryModule } from '../query/index.js';

function makeSocial(opts: { existing?: boolean } = {}) {
  const save = vi.fn().mockResolvedValue({ txHash: 'tx-add' });
  const unsave = vi.fn().mockResolvedValue({ txHash: 'tx-remove' });
  const getSave = vi
    .fn()
    .mockResolvedValue(
      opts.existing
        ? { contentPath: 'alice.near/post/123', v: 1, timestamp: 1 }
        : null
    );
  return {
    spies: { save, unsave, getSave },
    mod: { save, unsave, getSave } as unknown as SocialModule,
  };
}

function makeQuery() {
  const list = vi.fn().mockResolvedValue([
    {
      accountId: 'alice.near',
      contentPath: 'alice.near/post/1',
      value: '{}',
      blockHeight: 1,
      blockTimestamp: 1,
      operation: 'set',
    },
  ]);
  return {
    spies: { list },
    mod: { saves: { list } } as unknown as QueryModule,
  };
}

const POST_REF = { author: 'alice.near', postId: '123' };
const POST_ROW = {
  accountId: 'alice.near',
  postId: '123',
  value: '{}',
  blockHeight: 1,
  blockTimestamp: 1,
};

describe('SavesModule target normalisation', () => {
  it('accepts a PostRef', async () => {
    const { mod: social, spies } = makeSocial();
    const s = new SavesModule(social, makeQuery().mod);
    await s.add(POST_REF);
    expect(spies.save).toHaveBeenCalledWith('alice.near/post/123', undefined);
  });

  it('accepts a PostRow', async () => {
    const { mod: social, spies } = makeSocial();
    const s = new SavesModule(social, makeQuery().mod);
    await s.add(POST_ROW);
    expect(spies.save).toHaveBeenCalledWith('alice.near/post/123', undefined);
  });

  it('accepts a raw content path string', async () => {
    const { mod: social, spies } = makeSocial();
    const s = new SavesModule(social, makeQuery().mod);
    await s.add('alice.near/post/123', { folder: 'inspiration' });
    expect(spies.save).toHaveBeenCalledWith('alice.near/post/123', {
      folder: 'inspiration',
    });
  });
});

describe('SavesModule.has / get', () => {
  it('has returns false when no record', async () => {
    const { mod } = makeSocial({ existing: false });
    const s = new SavesModule(mod, makeQuery().mod);
    expect(await s.has(POST_REF)).toBe(false);
  });

  it('has returns true when record exists', async () => {
    const { mod } = makeSocial({ existing: true });
    const s = new SavesModule(mod, makeQuery().mod);
    expect(await s.has(POST_REF)).toBe(true);
  });

  it('get forwards viewer to social.getSave', async () => {
    const { mod, spies } = makeSocial({ existing: true });
    const s = new SavesModule(mod, makeQuery().mod);
    await s.get(POST_REF, { viewer: 'bob.near' });
    expect(spies.getSave).toHaveBeenCalledWith(
      'alice.near/post/123',
      'bob.near'
    );
  });
});

describe('SavesModule.toggle', () => {
  it('adds when no existing record', async () => {
    const { mod, spies } = makeSocial({ existing: false });
    const s = new SavesModule(mod, makeQuery().mod);
    const out = await s.toggle(POST_REF, { input: { folder: 'reread' } });
    expect(out.applied).toBe(true);
    expect(spies.save).toHaveBeenCalledWith('alice.near/post/123', {
      folder: 'reread',
    });
    expect(spies.unsave).not.toHaveBeenCalled();
  });

  it('removes when record already exists', async () => {
    const { mod, spies } = makeSocial({ existing: true });
    const s = new SavesModule(mod, makeQuery().mod);
    const out = await s.toggle(POST_REF);
    expect(out.applied).toBe(false);
    expect(spies.unsave).toHaveBeenCalledWith('alice.near/post/123');
    expect(spies.save).not.toHaveBeenCalled();
  });
});

describe('SavesModule.list', () => {
  it('forwards viewer / limit / offset to query.saves.list', async () => {
    const { mod, spies } = makeQuery();
    const s = new SavesModule(makeSocial().mod, mod);
    const out = await s.list({ viewer: 'alice.near', limit: 10, offset: 5 });
    expect(spies.list).toHaveBeenCalledWith('alice.near', {
      limit: 10,
      offset: 5,
    });
    expect(out).toHaveLength(1);
  });
});
