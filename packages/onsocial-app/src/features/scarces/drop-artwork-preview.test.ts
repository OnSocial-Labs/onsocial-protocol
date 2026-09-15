import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const overlayTs = readFileSync(join(here, 'drop-artwork-preview.tsx'), 'utf8');
const globalsCss = readFileSync(join(here, '../../app/globals.css'), 'utf8');

describe('DropArtOverlay page fill', () => {
  it('pins page surface to --bg so Glass/Carbon --mood-bg:transparent cannot leak', () => {
    expect(overlayTs).toContain("background: 'var(--bg)'");
    expect(overlayTs).toContain("['--mood-bg']: 'var(--bg)'");
    expect(globalsCss).toMatch(
      /\.drop-art-page-sheet-panel\.glass-sheet-panel\[data-surface='page'\] \{[\s\S]*?background: var\(--bg/
    );
  });
});
