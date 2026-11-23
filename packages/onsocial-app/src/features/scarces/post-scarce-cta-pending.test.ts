import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostScarceCtaPending } from '@/features/scarces/post-scarce-cta';

const here = dirname(fileURLToPath(import.meta.url));
const postCard = readFileSync(join(here, '../home/post-card.tsx'), 'utf8');
const scarceCta = readFileSync(join(here, 'post-scarce-cta.tsx'), 'utf8');

describe('PostScarceCtaPending', () => {
  it('reserves the commerce CTA chassis', () => {
    const html = renderToStaticMarkup(createElement(PostScarceCtaPending));
    expect(html).toContain('post-card-scarce-cta--pending');
    expect(html).toContain('standing-row-shimmer');
  });

  it('is wired as the structure seat on the feed card', () => {
    expect(postCard).toContain('scarceCtaSeat');
    expect(postCard).toContain('<PostScarceCtaPending');
    expect(postCard).toContain('scarcePostCtaPhase');
    expect(postCard).toContain('mediumSlot=');
    expect(postCard).toContain('post-card-scarce-read');
    expect(postCard).not.toContain('listenSlot');
    expect(postCard).not.toContain('post-card-scarce-listen');
    // Plain fromPost loading must not seat every card.
    expect(postCard).not.toContain("fromPostScarceStatus === 'loading' ||");
  });

  it('opens Drop over the feed like Drops and Just sold', () => {
    expect(scarceCta).toContain('DropOverlayLink');
    expect(scarceCta).toContain('seedCollectionViewFromPostScarceEmbed');
    expect(scarceCta).toContain('initial={dropInitial}');
  });

  it('passes sourcePostPath into the feed folio reader', () => {
    expect(postCard).toContain('WritingReadDocument');
    expect(postCard).toMatch(
      /WritingReadDocument[\s\S]*sourcePostPath=\{[\s\S]*collectionSourcePostPath/
    );
  });
});
