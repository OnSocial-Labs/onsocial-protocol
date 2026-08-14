import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  isScarceOriginalSelf,
  resolveScarceBodyText,
  resolveScarceOriginalHref,
} from '@/features/scarces/scarce-provenance-copy';

function postWithText(text: string): PostRow {
  return {
    accountId: 'alice.testnet',
    postId: '1',
    blockHeight: 1,
    blockTimestamp: 1,
    value: JSON.stringify({ type: 'md', text }),
  } as PostRow;
}

describe('resolveScarceBodyText', () => {
  it('prefers description when it differs from the cover title', () => {
    expect(
      resolveScarceBodyText({
        title: 'Short cover',
        description: 'Full post body that lives in metadata.',
      })
    ).toBe('Full post body that lives in metadata.');
  });

  it('hides body when description matches the cover title', () => {
    expect(
      resolveScarceBodyText({
        title: 'Same line',
        description: 'Same line',
      })
    ).toBeNull();
  });

  it('strips a leading cover title from a longer description', () => {
    expect(
      resolveScarceBodyText({
        title: 'Permanence changes what you\'re willing to say aloud.',
        description:
          'Permanence changes what you\'re willing to say aloud. Keep it short, honest, and worth owning.',
      })
    ).toBe('Keep it short, honest, and worth owning.');
  });

  it('does not strip a title that is only a word prefix', () => {
    expect(
      resolveScarceBodyText({
        title: 'Permanence',
        description: 'Permanence changes everything.',
      })
    ).toBe('Permanence changes everything.');
  });

  it('falls back to live post text when description is absent', () => {
    expect(
      resolveScarceBodyText({
        title: 'Cover',
        post: postWithText('Longer live post body.'),
      })
    ).toBe('Longer live post body.');
  });
});

describe('resolveScarceOriginalHref', () => {
  it('prefers an already-resolved postHref', () => {
    expect(
      resolveScarceOriginalHref({
        postHref: '/@alice.testnet/posts/42',
        sourcePostPath: 'alice.testnet/post/99',
      })
    ).toBe('/@alice.testnet/posts/42');
  });

  it('builds a personal post href from sourcePostPath', () => {
    expect(
      resolveScarceOriginalHref({
        sourcePostPath: 'alice.testnet/post/99',
      })
    ).toBe('/@alice.testnet/posts/99');
  });
});

describe('isScarceOriginalSelf', () => {
  const mintPost = {
    accountId: 'alice.testnet',
    postId: '99',
    blockHeight: 1,
    blockTimestamp: 1,
    value: '{}',
  } as PostRow;

  const announcePost = {
    accountId: 'bob.testnet',
    postId: '7',
    blockHeight: 1,
    blockTimestamp: 1,
    value: '{}',
  } as PostRow;

  it('hides original when source path is this post', () => {
    expect(isScarceOriginalSelf(mintPost, 'alice.testnet/post/99')).toBe(true);
  });

  it('keeps original link on a resale announce post', () => {
    expect(
      isScarceOriginalSelf(announcePost, 'alice.testnet/post/99')
    ).toBe(false);
  });

  it('matches via resolved postHref', () => {
    expect(
      isScarceOriginalSelf(mintPost, null, '/@alice.testnet/posts/99')
    ).toBe(true);
  });

  it('is false without a live post', () => {
    expect(isScarceOriginalSelf(null, 'alice.testnet/post/99')).toBe(false);
  });
});
