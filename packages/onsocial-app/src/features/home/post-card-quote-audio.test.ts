import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const quote = readFileSync(join(here, 'post-card-quote.tsx'), 'utf8');

describe('quoted post expanded audio', () => {
  it('opens the in-sheet player from the jacket, not an inline row', () => {
    expect(quote).toContain('onAudioOpen=');
    expect(quote).toContain('ScarceFeedMediumSheet');
    expect(quote).toContain('mode="audio"');
    expect(quote).toContain('feedEnlarge');
    expect(quote).toContain('setQuoteAudioOpen(true)');
  });
});
