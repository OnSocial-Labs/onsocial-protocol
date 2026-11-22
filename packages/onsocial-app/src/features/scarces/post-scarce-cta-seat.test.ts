import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PostScarceEmbed } from '@onsocial/sdk';
import {
  PostScarceCtaPending,
  scarcePostCtaPhase,
  type ScarcePostCtaPhase,
} from '@/features/scarces/post-scarce-cta';

function noneEmbed(): PostScarceEmbed {
  return { status: 'none', events: [] };
}

/** Same branch the feed card uses: pending component, or nothing. */
function renderSeat(input: {
  isRepostShell?: boolean;
  embed: PostScarceEmbed | null;
  hasDropPaint?: boolean;
  hasCollectionEmbed?: boolean;
  hasTokenEmbed?: boolean;
  canListScarce?: boolean;
}): string {
  const phase: ScarcePostCtaPhase = scarcePostCtaPhase({
    isRepostShell: input.isRepostShell ?? false,
    embed: input.embed,
    hasDropPaint: input.hasDropPaint ?? false,
    hasCollectionEmbed: input.hasCollectionEmbed ?? false,
    hasTokenEmbed: input.hasTokenEmbed ?? false,
    canListScarce: input.canListScarce ?? false,
  });
  const node: ReactNode =
    phase === 'pending' ? createElement(PostScarceCtaPending) : null;
  return renderToStaticMarkup(createElement('div', null, node));
}

describe('scarce post CTA seat', () => {
  it('renders no seat when a settled none seed is a delisted collection', () => {
    const html = renderSeat({
      embed: noneEmbed(),
      hasCollectionEmbed: true,
      hasDropPaint: true,
    });
    expect(html).toBe('<div></div>');
    expect(html).not.toContain('post-card-scarce-cta--pending');
  });

  it('renders no seat when a settled none seed is a delisted token', () => {
    const html = renderSeat({
      embed: noneEmbed(),
      hasTokenEmbed: true,
    });
    expect(html).toBe('<div></div>');
    expect(html).not.toContain('post-card-scarce-cta--pending');
  });

  it('still seats a known jacket whose ask has not landed', () => {
    const html = renderSeat({
      embed: {
        status: 'drop',
        collectionId: 'drop-1',
        events: [],
      },
      hasCollectionEmbed: true,
    });
    expect(html).toContain('post-card-scarce-cta--pending');
  });

  it('keeps the author List control live when the seed is none', () => {
    expect(
      scarcePostCtaPhase({
        isRepostShell: false,
        embed: noneEmbed(),
        hasDropPaint: false,
        hasCollectionEmbed: false,
        hasTokenEmbed: false,
        canListScarce: true,
      })
    ).toBe('live');
  });
});
