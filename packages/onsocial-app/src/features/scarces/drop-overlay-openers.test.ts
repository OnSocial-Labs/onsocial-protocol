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

  it('warms the drop chunk on Market (listings + shop)', () => {
    expect(src('features/market/market-page-panel.tsx')).toContain(
      'warmDropPanel'
    );
  });
});
