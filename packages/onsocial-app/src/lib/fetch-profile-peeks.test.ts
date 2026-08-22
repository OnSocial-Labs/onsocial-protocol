import { describe, expect, it } from 'vitest';
import {
  isDisplayablePostPeek,
  toProfileCreatedPeek,
  toProfilePostPeek,
} from '@/lib/fetch-profile-peeks';
import type { PostRow } from '@onsocial/sdk';

describe('toProfileCreatedPeek', () => {
  it('maps mint rows to collection deep links', () => {
    const peek = toProfileCreatedPeek({
      tokenId: 'quiet-hours:2',
      memo: 'The Quiet Hours',
      extraData: JSON.stringify({
        media: 'https://cdn.example/cover.png',
        kind: 'writing',
      }),
      blockTimestamp: 1_700_000_000_000,
    });
    expect(peek).toEqual({
      tokenId: 'quiet-hours:2',
      title: 'The Quiet Hours',
      mediaUrl: 'https://cdn.example/cover.png',
      blockTimestamp: 1_700_000_000_000,
      href: '/collection/quiet-hours?read=1',
      kindLabel: 'Writing',
      actionLabel: 'Read',
    });
  });

  it('omits kind when extra has none', () => {
    const peek = toProfileCreatedPeek({
      tokenId: 'art-drop:1',
      memo: 'Untitled',
    });
    expect(peek?.kindLabel).toBeNull();
    expect(peek?.actionLabel).toBe('Open');
  });

  it('skips rows without a token id', () => {
    expect(toProfileCreatedPeek({ tokenId: '  ' })).toBeNull();
  });
});

describe('toProfilePostPeek', () => {
  it('carries content labels for Safe mode peeks', () => {
    const post = {
      accountId: 'alice.testnet',
      postId: '1',
      value: JSON.stringify({
        v: 1,
        text: 'behind the curtain',
        contentWarning: 'Spoilers',
        nsfw: true,
      }),
      blockHeight: 1,
      blockTimestamp: 1_700_000_000_000,
      kind: 'text',
    } as PostRow;

    expect(toProfilePostPeek(post)).toMatchObject({
      accountId: 'alice.testnet',
      postId: '1',
      text: 'behind the curtain',
      kind: null,
      contentWarning: 'Spoilers',
      nsfw: true,
    });
  });

  it('maps poll embeds to poll plus the first two options', () => {
    const post = {
      accountId: 'alice.testnet',
      postId: '4',
      value: JSON.stringify({
        v: 1,
        text: '2 be or not 2 be.',
        embeds: [
          {
            kind: 'poll',
            question: '2 be or not 2 be.',
            options: ['Be', 'Not be', 'Maybe'],
          },
        ],
      }),
      blockHeight: 1,
      blockTimestamp: 1_700_000_000_000,
      kind: 'poll',
    } as PostRow;

    expect(toProfilePostPeek(post)).toMatchObject({
      kind: 'poll',
      pollOptions: ['Be', 'Not be'],
    });
  });

  it('labels a closed poll closed, not poll', () => {
    const post = {
      accountId: 'alice.testnet',
      postId: '5',
      value: JSON.stringify({
        v: 1,
        text: '2 be or not 2 be.',
        embeds: [
          {
            kind: 'poll',
            question: '2 be or not 2 be.',
            options: ['2 be', 'not 2 be'],
            closesAt: 1_721_000_000_000,
          },
        ],
      }),
      blockHeight: 1,
      blockTimestamp: 1_721_000_000_000,
      kind: 'poll',
    } as PostRow;

    expect(
      toProfilePostPeek(post, 1_721_000_000_001)
    ).toMatchObject({ kind: 'closed', pollOptions: ['2 be', 'not 2 be'] });
    expect(toProfilePostPeek(post, 1_720_999_999_999).kind).toBe('poll');
  });

  it('labels a quote as quote even when the original is video', () => {
    const post = {
      accountId: 'alice.testnet',
      postId: '6',
      value: JSON.stringify({
        v: 1,
        text: 'Not looking too bad.',
        media: [{ cid: 'https://cdn.example/clip.mp4', mime: 'video/mp4' }],
      }),
      blockHeight: 1,
      blockTimestamp: 1_721_000_000_000,
      kind: 'video',
      refType: 'quote',
      refPath: 'bob.testnet/post/9',
    } as PostRow;

    expect(toProfilePostPeek(post).kind).toBe('quote');
  });

  it('treats optimistic quotes (refType post + refPath) as quotes', () => {
    const post = {
      accountId: 'alice.testnet',
      postId: '7',
      value: JSON.stringify({ v: 1, text: 'Not looking too bad.' }),
      blockHeight: 1,
      blockTimestamp: 1_721_000_000_000,
      kind: 'video',
      refType: 'post',
      refPath: 'bob.testnet/post/9',
    } as PostRow;

    expect(toProfilePostPeek(post).kind).toBe('quote');
  });

  it('carries the first attachment as the peek thumb', () => {
    const post = {
      accountId: 'alice.testnet',
      postId: '2',
      value: JSON.stringify({
        v: 1,
        text: '',
        media: [
          { cid: 'https://cdn.example/a.jpg', mime: 'image/jpeg' },
          { cid: 'https://cdn.example/b.jpg', mime: 'image/jpeg' },
        ],
      }),
      blockHeight: 1,
      blockTimestamp: 1_700_000_000_000,
      kind: 'photo',
    } as PostRow;

    expect(toProfilePostPeek(post).media).toEqual({
      url: 'https://cdn.example/a.jpg',
      mime: 'image/jpeg',
    });
    expect(toProfilePostPeek(post).kind).toBe('photo');
  });

  it('is null media for text-only posts', () => {
    const post = {
      accountId: 'alice.testnet',
      postId: '3',
      value: JSON.stringify({ v: 1, text: 'plain' }),
      blockHeight: 1,
      blockTimestamp: 1_700_000_000_000,
      kind: 'text',
    } as PostRow;
    expect(toProfilePostPeek(post).media).toBeNull();
  });

  it('rejects bare repost shells; keeps text, media, or labeled peeks', () => {
    expect(
      isDisplayablePostPeek({ text: '', nsfw: false, contentWarning: undefined })
    ).toBe(false);
    expect(isDisplayablePostPeek({ text: 'hello' })).toBe(true);
    expect(
      isDisplayablePostPeek({ text: '', pollOptions: ['Yes', 'No'] })
    ).toBe(true);
    expect(isDisplayablePostPeek({ text: '', nsfw: true })).toBe(true);
    // Caption-less photo posts are now displayable — the thumb carries them.
    expect(
      isDisplayablePostPeek({
        text: '',
        media: { url: 'https://cdn.example/a.jpg', mime: 'image/jpeg' },
      })
    ).toBe(true);
  });
});

