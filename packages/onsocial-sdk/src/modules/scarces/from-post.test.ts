import { describe, expect, it, vi } from 'vitest';
import { ScarcesModule } from './index.js';
import type { SocialModule } from '../../social.js';
import type { MintFromPostOptions } from '../../builders/scarces/from-post.js';

const ROW = {
  accountId: 'alice.near',
  postId: '123',
  value: JSON.stringify({
    text: 'hello world',
    media: [
      { cid: 'bafyMedia1', mime: 'image/webp', size: 100 },
      'ipfs://bafyMedia2',
    ],
  }),
  blockHeight: 1,
  blockTimestamp: 1,
};

function makeMod(opts: { social?: boolean } = {}) {
  const requestForm = vi.fn().mockResolvedValue({ txHash: 'minted' });
  const post = vi.fn().mockResolvedValue({ txHash: 'lazy' });
  const http = { requestForm, post, get: vi.fn() } as never;

  const getOne = vi.fn().mockResolvedValue({
    value: JSON.stringify({
      text: 'remote post',
      media: [{ cid: 'bafyRemote', mime: 'image/png' }],
    }),
  });
  const social = opts.social
    ? ({ getOne } as unknown as SocialModule)
    : undefined;

  const mod = new ScarcesModule(http, social);
  return { mod, spies: { requestForm, post, getOne } };
}

describe('ScarcesModule.fromPost.mint', () => {
  it('reuses media CID from PostRow without network read', async () => {
    const { mod, spies } = makeMod();
    await mod.fromPost.mint(ROW);
    expect(spies.getOne).not.toHaveBeenCalled();
    const [, , form] = spies.requestForm.mock.calls[0];
    expect(form.get('mediaCid')).toBe('bafyMedia1');
    expect(form.get('title')).toBe('hello world');
    const extra = JSON.parse(form.get('extra') as string);
    expect(extra.sourcePost).toEqual({
      author: 'alice.near',
      postId: '123',
      path: 'alice.near/post/123',
    });
  });

  it('truncates long text to 100 char title', async () => {
    const { mod, spies } = makeMod();
    const longText = 'x'.repeat(200);
    await mod.fromPost.mint({
      ...ROW,
      value: JSON.stringify({ text: longText }),
    });
    const [, , form] = spies.requestForm.mock.calls[0];
    expect((form.get('title') as string).length).toBe(100);
    expect(form.get('title')).toMatch(/\.\.\.$/);
  });

  it('falls back to "Post <id>" title when text empty', async () => {
    const { mod, spies } = makeMod();
    await mod.fromPost.mint({
      ...ROW,
      value: JSON.stringify({ text: '' }),
    });
    const [, , form] = spies.requestForm.mock.calls[0];
    expect(form.get('title')).toBe('Post 123');
  });

  it('caller overrides win (title, mediaCid, extra)', async () => {
    const { mod, spies } = makeMod();
    const overrides: MintFromPostOptions = {
      title: 'Custom',
      mediaCid: 'bafyOverride',
      extra: { campaign: 'genesis' },
      copies: 5,
      royalty: { 'alice.near': 1000 },
    };
    await mod.fromPost.mint(ROW, overrides);
    const [, , form] = spies.requestForm.mock.calls[0];
    expect(form.get('title')).toBe('Custom');
    expect(form.get('mediaCid')).toBe('bafyOverride');
    expect(form.get('copies')).toBe('5');
    const extra = JSON.parse(form.get('extra') as string);
    expect(extra.campaign).toBe('genesis');
    expect(extra.sourcePost.postId).toBe('123');
  });

  it('reads body via SocialModule when given a PostRef', async () => {
    const { mod, spies } = makeMod({ social: true });
    await mod.fromPost.mint({ author: 'bob.near', postId: '999' });
    expect(spies.getOne).toHaveBeenCalledWith('post/999', 'bob.near');
    const [, , form] = spies.requestForm.mock.calls[0];
    expect(form.get('mediaCid')).toBe('bafyRemote');
    expect(form.get('title')).toBe('remote post');
  });

  it('throws helpful error when PostRef given without SocialModule', async () => {
    const { mod } = makeMod();
    await expect(
      mod.fromPost.mint({ author: 'bob.near', postId: '999' })
    ).rejects.toThrow(/PostRef requires a SocialModule/);
  });
});

describe('ScarcesModule.fromPost.list', () => {
  it('creates a lazy listing carrying media + extra + royalty', async () => {
    const { mod, spies } = makeMod();
    await mod.fromPost.list(ROW, '5', {
      royalty: { 'alice.near': 1000 },
    });
    const [, endpoint, form] = spies.requestForm.mock.calls[0];
    expect(endpoint).toBe('/compose/lazy-list');
    expect(form.get('priceNear')).toBe('5');
    expect(form.get('mediaCid')).toBe('bafyMedia1');
    expect(form.get('title')).toBe('hello world');
    expect(JSON.parse(form.get('royalty') as string)).toEqual({
      'alice.near': 1000,
    });
    const extra = JSON.parse(form.get('extra') as string);
    expect(extra.sourcePost.path).toBe('alice.near/post/123');
  });
});
