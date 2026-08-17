import { describe, expect, it } from 'vitest';
import {
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
      href: '/collection/quiet-hours',
      kindLabel: 'Writing',
    });
  });

  it('omits kind when extra has none', () => {
    const peek = toProfileCreatedPeek({
      tokenId: 'art-drop:1',
      memo: 'Untitled',
    });
    expect(peek?.kindLabel).toBeNull();
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
      contentWarning: 'Spoilers',
      nsfw: true,
    });
  });
});
