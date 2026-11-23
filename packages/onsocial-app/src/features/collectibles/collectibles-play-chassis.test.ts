import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('collectibles play chassis', () => {
  it('seats #N and ⋮ in the title trail like the drop face', () => {
    const panel = readFileSync(join(here, 'collectibles-play-panel.tsx'), 'utf8');
    expect(panel).toContain('drops-discovery-head-trail');
    expect(panel).toContain('collection-edition-trail');
    expect(panel).toContain('faceEditionToken');
    expect(panel).toContain('peekOwnedTokenForCollection');
    expect(panel).toContain('CollectiblesHoldingRowMenu');
    expect(panel).not.toContain('collectibles-play-edition');
    expect(panel).not.toContain('trigger="label"');
  });
});
