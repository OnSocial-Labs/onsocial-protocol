import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = join(here, '../..');

function src(rel: string): string {
  return readFileSync(join(appSrc, rel), 'utf8');
}

/** In-app Drop taps share one overlay — no cold `/collection/…` soft-nav. */
describe('Drop overlay openers', () => {
  it('opens with a native anchor so App Router never mounts loading.tsx', () => {
    const open = src('features/scarces/drop-overlay-open.tsx');
    expect(open).toContain('export function DropOverlayLink');
    expect(open).toMatch(/<a\b/);
    expect(open).not.toMatch(/from 'next\/link'/);
    expect(open).not.toContain('dropOverlayLinkHandlers');
  });

  it('opens creator listing + portfolio drops over the layer', () => {
    expect(src('features/market/market-creator-drop-row.tsx')).toContain(
      'DropOverlayLink'
    );
    expect(src('features/market/market-creator-drop-row.tsx')).toContain(
      'market-listing-row-open'
    );
    expect(src('components/portfolio/portfolio-drop-row.tsx')).toContain(
      'market-listing-row-open'
    );
  });

  it('opens Market rows and Drops list over the layer', () => {
    expect(src('features/market/market-sale-row.tsx')).toContain(
      'DropOverlayLink'
    );
    expect(src('features/market/market-listing-row.tsx')).toContain(
      'DropOverlayLink'
    );
    expect(src('features/drops/drops-page-panel.tsx')).toContain(
      'DropOverlayLink'
    );
  });

  it('seeds Events, Discover catalog, Collectibles pass, and hub peeks', () => {
    expect(src('features/events/events-page-panel.tsx')).toContain(
      'seedCollectionViewFromPeek'
    );
    expect(src('features/discover/discover-catalog-results.tsx')).toContain(
      'seedCollectionViewFromPeek'
    );
    expect(
      src('features/collectibles/collectibles-holding-row.tsx')
    ).toContain('seedCollectionViewFromPeek');
    expect(src('features/scarces/hubs-latest-drops-panel.tsx')).toContain(
      'seedCollectionViewFromPeek'
    );
  });

  it('routes play View drop, notifications, create success, and facts through openDrop', () => {
    expect(src('features/collectibles/collectibles-play-panel.tsx')).toContain(
      'useDropOverlayOpen'
    );
    expect(src('features/notifications/notifications-panel.tsx')).toContain(
      'useDropOverlayOpen'
    );
    expect(src('features/scarces/create-drop-panel.tsx')).toContain(
      'useDropOverlayOpen'
    );
    expect(src('features/scarces/scarce-listing-facts-sheet.tsx')).toContain(
      'DropOverlayLink'
    );
  });

  it('warms the drop chunk on Market, Drops, and Events', () => {
    expect(src('features/market/market-page-panel.tsx')).toContain(
      'warmDropPanel'
    );
    expect(src('features/drops/drops-page-panel.tsx')).toContain(
      'warmDropPanel'
    );
    expect(src('features/events/events-page-panel.tsx')).toContain(
      'warmDropPanel'
    );
  });
});
