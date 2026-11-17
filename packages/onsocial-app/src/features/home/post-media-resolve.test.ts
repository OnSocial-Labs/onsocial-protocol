import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FEED_MEDIA_RESOLVE_FALLBACK_MS } from '@/features/home/post-media';

const homeSrc = dirname(fileURLToPath(import.meta.url));

describe('feed media resolve settle', () => {
  it('names a fallback budget aligned with the SDK poster capture window', () => {
    // Same 8s budget as packages/onsocial-sdk internal/media-poster POSTER_TIMEOUT_MS.
    expect(FEED_MEDIA_RESOLVE_FALLBACK_MS).toBe(8_000);
  });

  it('settles video shimmer on metadata/canplay/error plus the named fallback', () => {
    const source = readFileSync(join(homeSrc, 'post-media.tsx'), 'utf8');
    expect(source).toContain('FEED_MEDIA_RESOLVE_FALLBACK_MS');
    expect(source).toContain('onLoadedMetadata');
    expect(source).toContain('onCanPlay');
    expect(source).toMatch(/onLoadedMetadata=\{[\s\S]*markResolved/);
    expect(source).toMatch(/onCanPlay=\{markResolved\}/);
    expect(source).toContain('setTimeout');
  });
});
