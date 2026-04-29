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

  it('persists extra.gallery for multi-photo posts (cover stays in media)', async () => {
    const { mod, spies } = makeMod();
    const galleryRow = {
      ...ROW,
      value: JSON.stringify({
        text: 'gallery post',
        media: [
          { cid: 'bafyA', mime: 'image/jpeg' },
          { cid: 'bafyB', mime: 'image/png' },
          { cid: 'bafyC', mime: 'image/webp' },
        ],
      }),
    };
    await mod.fromPost.mint(galleryRow);
    const [, , form] = spies.requestForm.mock.calls[0];
    expect(form.get('mediaCid')).toBe('bafyA');
    const extra = JSON.parse(form.get('extra') as string);
    expect(extra.gallery).toEqual(['bafyA', 'bafyB', 'bafyC']);
  });

  it('does not add extra.gallery when post has only one image', async () => {
    const { mod, spies } = makeMod();
    // ROW has two images (a MediaRef + a legacy ipfs:// string); use a
    // single-image fixture to exercise the no-gallery branch.
    const singleImage = {
      ...ROW,
      value: JSON.stringify({
        text: 'just one',
        media: [{ cid: 'bafyOnly', mime: 'image/png' }],
      }),
    };
    await mod.fromPost.mint(singleImage);
    const [, , form] = spies.requestForm.mock.calls[0];
    const extra = JSON.parse(form.get('extra') as string);
    expect(extra.gallery).toBeUndefined();
  });

  it('useTextCard:true clears mediaCid and forwards photo as cardPhotoCid', async () => {
    const { mod, spies } = makeMod();
    await mod.fromPost.mint(ROW, { useTextCard: true });
    const [, , form] = spies.requestForm.mock.calls[0];
    // No cover image — gateway will render the auto text-card.
    expect(form.get('mediaCid')).toBeNull();
    // Post's first image becomes the proof photo (only honoured when
    // the gateway renders a receipt-mood card).
    expect(form.get('cardPhotoCid')).toBe('bafyMedia1');
  });

  it('useTextCard:true with no post media renders pure text-card', async () => {
    const { mod, spies } = makeMod();
    const textOnly = {
      ...ROW,
      value: JSON.stringify({ text: 'words only' }),
    };
    await mod.fromPost.mint(textOnly, { useTextCard: true });
    const [, , form] = spies.requestForm.mock.calls[0];
    expect(form.get('mediaCid')).toBeNull();
    expect(form.get('cardPhotoCid')).toBeNull();
  });

  it('caller can override cardPhotoCid explicitly', async () => {
    const { mod, spies } = makeMod();
    await mod.fromPost.mint(ROW, {
      useTextCard: true,
      cardPhotoCid: 'bafyOverridePhoto',
    });
    const [, , form] = spies.requestForm.mock.calls[0];
    expect(form.get('cardPhotoCid')).toBe('bafyOverridePhoto');
  });
});

describe('ScarcesModule.fromPost.mintReceipt', () => {
  it('forwards receipt mood + post photo + useTextCard:true', async () => {
    const { mod, spies } = makeMod();
    await mod.fromPost.mintReceipt({
      ...ROW,
      value: JSON.stringify({
        text: 'Shipped.',
        media: [{ cid: 'bafyProof', mime: 'image/png' }],
      }),
    });
    const [, , form] = spies.requestForm.mock.calls[0];
    expect(form.get('cardBg')).toBe('receipt-light');
    expect(form.get('cardPhotoCid')).toBe('bafyProof');
    // text-card mode: post photo never becomes the cover
    expect(form.get('mediaCid')).toBeNull();
    expect(form.get('title')).toBe('Shipped.');
  });

  it('throws when title (or post text) exceeds 60 chars', async () => {
    const { mod } = makeMod();
    const longText = 'x'.repeat(80);
    await expect(
      mod.fromPost.mintReceipt({
        ...ROW,
        value: JSON.stringify({
          text: longText,
          media: [{ cid: 'bafyP', mime: 'image/png' }],
        }),
      })
    ).rejects.toThrow(/short claims/);
  });

  it('throws when no photo is available (post has no media + no override)', async () => {
    const { mod } = makeMod();
    await expect(
      mod.fromPost.mintReceipt({
        ...ROW,
        value: JSON.stringify({ text: 'Shipped.' }),
      })
    ).rejects.toThrow(/require a photo/);
  });

  it('caller-provided cardPhotoCid satisfies the photo requirement', async () => {
    const { mod, spies } = makeMod();
    await mod.fromPost.mintReceipt(
      { ...ROW, value: JSON.stringify({ text: 'Shipped.' }) },
      { cardPhotoCid: 'bafyExternalProof' }
    );
    const [, , form] = spies.requestForm.mock.calls[0];
    expect(form.get('cardPhotoCid')).toBe('bafyExternalProof');
    expect(form.get('cardBg')).toBe('receipt-light');
  });

  it('caller-provided title overrides post text for length check', async () => {
    const { mod, spies } = makeMod();
    // Post text is short, opts.title is too long → must throw on opts.title.
    const longTitle = 'x'.repeat(80);
    await expect(
      mod.fromPost.mintReceipt(
        {
          ...ROW,
          value: JSON.stringify({
            text: 'ok',
            media: [{ cid: 'bafyP', mime: 'image/png' }],
          }),
        },
        { title: longTitle }
      )
    ).rejects.toThrow(/short claims/);
    expect(spies.requestForm).not.toHaveBeenCalled();
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
