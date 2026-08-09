import { describe, expect, it } from 'vitest';
import {
  parsePostContentLabels,
  resolveSensitiveGateMode,
  safeModePeekText,
} from '@/lib/post-content-labels';
import { toProfilePostPeek } from '@/lib/fetch-profile-peeks';
import type { PostRow } from '@onsocial/sdk';

/**
 * Inventory of Safe mode surfaces — keep in sync when adding post previews.
 * Pure assertions; UI wiring is covered by feature write/parse tests.
 */
describe('safe mode surface inventory', () => {
  const labeled: PostRow = {
    accountId: 'alice.testnet',
    postId: '9',
    value: JSON.stringify({
      v: 1,
      text: 'secret body',
      contentWarning: 'Spoilers',
      nsfw: true,
    }),
    blockHeight: 1,
    blockTimestamp: 1,
  };

  it('feed/detail gate: NSFW → blur, spoiler-only → hide', () => {
    const both = parsePostContentLabels(labeled.value);
    expect(resolveSensitiveGateMode(both, true, false)).toBe('blur');
    expect(
      resolveSensitiveGateMode({ contentWarning: 'Ending' }, true, false)
    ).toBe('hide');
  });

  it('quote inset / reply target: same gate modes as feed', () => {
    const spoiler = { contentWarning: 'Spoiler' };
    expect(resolveSensitiveGateMode(spoiler, true, false)).toBe('hide');
    expect(resolveSensitiveGateMode({ nsfw: true }, true, false)).toBe('blur');
  });

  it('profile peeks: redacts body under Safe mode via labels on peek', () => {
    const peek = toProfilePostPeek(labeled);
    expect(peek.nsfw).toBe(true);
    expect(peek.contentWarning).toBe('Spoilers');
    expect(
      safeModePeekText(peek.text, peek, true)
    ).toBe('Spoilers');
    expect(safeModePeekText(peek.text, peek, false)).toBe('secret body');
  });
});
