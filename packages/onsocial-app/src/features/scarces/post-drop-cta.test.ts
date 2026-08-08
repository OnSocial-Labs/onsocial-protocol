import { describe, expect, it } from 'vitest';
import type { PostScarceEmbed } from '@onsocial/sdk';
import { resolvePostDropCta } from '@/features/scarces/post-drop-cta';

function drop(partial: Partial<PostScarceEmbed> = {}): PostScarceEmbed {
  return {
    status: 'drop',
    collectionId: 'drop-1',
    remaining: 3,
    copies: 10,
    priceNear: '1',
    events: [],
    ...partial,
  };
}

describe('resolvePostDropCta', () => {
  it('mutes Your Drop for the post author on a primary Drop', () => {
    expect(
      resolvePostDropCta({ embed: drop(), isPostAuthor: true })
    ).toEqual({ kind: 'muted', mutedLabel: 'Your Drop' });
  });

  it('mutes Your edition when the author posted a holder token', () => {
    expect(
      resolvePostDropCta({
        embed: drop({ tokenId: 'drop-1:2', status: 'listed' }),
        isPostAuthor: true,
      })
    ).toEqual({ kind: 'muted', mutedLabel: 'Your edition' });
  });

  it('mints for viewers when primary supply remains', () => {
    expect(
      resolvePostDropCta({ embed: drop(), isPostAuthor: false })
    ).toEqual({ kind: 'mint' });
  });

  it('opens Drop when primary supply is exhausted', () => {
    expect(
      resolvePostDropCta({
        embed: drop({ status: 'sold', remaining: 0 }),
        isPostAuthor: false,
      })
    ).toEqual({ kind: 'open' });
  });

  it('buys when a holder edition is listed', () => {
    expect(
      resolvePostDropCta({
        embed: drop({ tokenId: 'drop-1:2', status: 'listed' }),
        isPostAuthor: false,
      })
    ).toEqual({ kind: 'buy' });
  });

  it('opens Drop for holder posts that are not listed', () => {
    expect(
      resolvePostDropCta({
        embed: drop({ tokenId: 'drop-1:2', status: 'drop', remaining: 5 }),
        isPostAuthor: false,
      })
    ).toEqual({ kind: 'open' });
  });
});
