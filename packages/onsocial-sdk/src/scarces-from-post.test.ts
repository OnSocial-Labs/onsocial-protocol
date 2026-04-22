import { describe, expect, it, vi } from 'vitest';
import {
  ScarcesModule,
  extractPostMedia,
  type MintFromPostOptions,
} from './scarces.js';
import type { SocialModule } from './social.js';

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

function makeScarces(opts: { social?: boolean } = {}) {
  const requestForm = vi.fn().mockResolvedValue({ txHash: 'minted' });
  const post = vi.fn().mockResolvedValue({ txHash: 'lazy' });
  const http = {
    requestForm,
    post,
    get: vi.fn(),
  } as never;

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

describe('extractPostMedia', () => {
  it('parses string body and surfaces first MediaRef cid', () => {
    const out = extractPostMedia(ROW.value);
    expect(out.text).toBe('hello world');
    expect(out.mediaCid).toBe('bafyMedia1');
    expect(out.media).toHaveLength(2);
  });

  it('falls back to ipfs:// string when no MediaRef present', () => {
    const out = extractPostMedia(
      JSON.stringify({ text: 't', media: ['ipfs://onlyString'] })
    );
    expect(out.mediaCid).toBe('onlyString');
  });

  it('returns empty media when post has no media', () => {
    const out = extractPostMedia(JSON.stringify({ text: 'plain' }));
    expect(out.text).toBe('plain');
    expect(out.mediaCid).toBeUndefined();
    expect(out.media).toEqual([]);
  });

  it('handles unparseable strings gracefully', () => {
    const out = extractPostMedia('not json');
    expect(out.text).toBe('not json');
    expect(out.mediaCid).toBeUndefined();
  });

  it('handles null / undefined', () => {
    expect(extractPostMedia(null).media).toEqual([]);
    expect(extractPostMedia(undefined).text).toBe('');
  });
});

describe('ScarcesModule.mintFromPost', () => {
  it('reuses media CID from PostRow without network read', async () => {
    const { mod, spies } = makeScarces();
    await mod.mintFromPost(ROW);
    expect(spies.getOne).not.toHaveBeenCalled();
    expect(spies.requestForm).toHaveBeenCalledTimes(1);
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
    const { mod, spies } = makeScarces();
    const longText = 'x'.repeat(200);
    await mod.mintFromPost({
      ...ROW,
      value: JSON.stringify({ text: longText }),
    });
    const [, , form] = spies.requestForm.mock.calls[0];
    expect((form.get('title') as string).length).toBe(100);
    expect(form.get('title')).toMatch(/\.\.\.$/);
  });

  it('falls back to "Post <id>" title when text empty', async () => {
    const { mod, spies } = makeScarces();
    await mod.mintFromPost({
      ...ROW,
      value: JSON.stringify({ text: '' }),
    });
    const [, , form] = spies.requestForm.mock.calls[0];
    expect(form.get('title')).toBe('Post 123');
  });

  it('caller overrides win (title, mediaCid, extra)', async () => {
    const { mod, spies } = makeScarces();
    const overrides: MintFromPostOptions = {
      title: 'Custom',
      mediaCid: 'bafyOverride',
      extra: { campaign: 'genesis' },
      copies: 5,
      royalty: { 'alice.near': 1000 },
    };
    await mod.mintFromPost(ROW, overrides);
    const [, , form] = spies.requestForm.mock.calls[0];
    expect(form.get('title')).toBe('Custom');
    expect(form.get('mediaCid')).toBe('bafyOverride');
    expect(form.get('copies')).toBe('5');
    const extra = JSON.parse(form.get('extra') as string);
    expect(extra.campaign).toBe('genesis');
    expect(extra.sourcePost.postId).toBe('123');
  });

  it('reads body via SocialModule when given a PostRef', async () => {
    const { mod, spies } = makeScarces({ social: true });
    await mod.mintFromPost({ author: 'bob.near', postId: '999' });
    expect(spies.getOne).toHaveBeenCalledWith('post/999', 'bob.near');
    const [, , form] = spies.requestForm.mock.calls[0];
    expect(form.get('mediaCid')).toBe('bafyRemote');
    expect(form.get('title')).toBe('remote post');
  });

  it('throws helpful error when PostRef given without SocialModule', async () => {
    const { mod } = makeScarces();
    await expect(
      mod.mintFromPost({ author: 'bob.near', postId: '999' })
    ).rejects.toThrow(/PostRef requires a SocialModule/);
  });
});

describe('ScarcesModule.listFromPost', () => {
  it('creates a lazy listing carrying media + extra + royalty', async () => {
    const { mod, spies } = makeScarces();
    await mod.listFromPost(ROW, '5', {
      royalty: { 'alice.near': 1000 },
    });
    expect(spies.requestForm).toHaveBeenCalledTimes(1);
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
