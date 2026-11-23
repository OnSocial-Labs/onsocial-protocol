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

  it('opens Drop as a full place from the feed (not Just sold appear)', () => {
    expect(scarceCta).toContain('DropPlaceLink');
    expect(scarceCta).toContain('seedCollectionViewFromPostScarceEmbed');
    expect(scarceCta).toContain('initial={dropInitial}');
  });

  it('seeds the Drop place title from paint on first paint', () => {
    expect(postCard).toContain('dropPaint?.title?.trim()');
    expect(postCard).toContain('dropTitle: scarceDropTitle');
    expect(postCard).toContain('dropCreator: scarceDropCreator');
    expect(scarceCta).toContain('title: dropTitle');
    expect(scarceCta).toContain('initialCreator={dropCreator}');
  });

  it('aligns list→drop with Drops: face from seed, creator when known', () => {
    const panel = readFileSync(
      join(here, 'collection-page-panel.tsx'),
      'utf8'
    );
    const openers = readFileSync(join(here, 'drop-place-open.tsx'), 'utf8');
    const embed = readFileSync(
      join(here, 'use-post-collection-embed.ts'),
      'utf8'
    );
    expect(openers).toContain('initialCreator');
    expect(openers).toContain('readCollectionView');
    expect(embed).toContain('rememberCollectionView');
    expect(panel).toContain('collectionSoftFillPeek');
    expect(panel).toContain('collectionFaceTitle');
    expect(panel).toContain('collectionCreatorNameLine');
    expect(panel).not.toContain('creatorNameUnknown');
    expect(panel).toContain('initialCreator');
    expect(panel).not.toContain('showTitlePending');
    expect(panel).not.toContain('showTracksPending');
    expect(panel).not.toContain('faceAboutText');
  });

  it('seats Open Collectibles before wallet / hold settle', () => {
    const panel = readFileSync(
      join(here, 'collection-page-panel.tsx'),
      'utf8'
    );
    // Use-actions seat is always mounted; chassis holds height until vaultHref.
    expect(panel).not.toContain('showCollectiblesEarly');
    expect(panel).not.toContain('holderActionsPending');
    expect(panel).not.toContain('Checking your collection');
    expect(panel).toContain('collection-use-actions-chassis');
    expect(panel).toContain('vaultHref');
    expect(panel).toContain('Open Collectibles');
    expect(panel).toContain('DropFaceFans');
    expect(panel).toContain('has-fans-seat');
    expect(panel).toContain('countsLoading={dropLoves.fansLoading}');
  });

  it('passes sourcePostPath into the feed folio reader', () => {
    expect(postCard).toContain('WritingReadDocument');
    expect(postCard).toMatch(
      /WritingReadDocument[\s\S]*sourcePostPath=\{[\s\S]*collectionSourcePostPath/
    );
  });
});
