import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
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
