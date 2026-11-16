import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const strip = readFileSync(join(here, 'endorsement-media-strip.tsx'), 'utf8');
const row = readFileSync(join(here, 'endorsement-list-row.tsx'), 'utf8');
const focus = readFileSync(join(here, 'endorsement-focus-sheet.tsx'), 'utf8');

describe('endorsement media audio path', () => {
  it('opens the in-sheet player from a jacket, not an inline row', () => {
    expect(strip).toContain('onAudioOpen=');
    expect(strip).toContain('ScarceFeedMediumSheet');
    expect(strip).toContain('mode="audio"');
    expect(strip).toContain('feedEnlarge');
  });

  it('is wired on list and focus surfaces', () => {
    expect(row).toContain('EndorsementMediaStrip');
    expect(row).not.toContain('PostMediaStrip');
    expect(focus).toContain('EndorsementMediaStrip');
    expect(focus).not.toContain('PostMediaStrip');
  });
});
