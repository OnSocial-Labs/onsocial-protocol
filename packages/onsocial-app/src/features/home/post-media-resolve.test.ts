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
    expect(source).toContain('useFeedMediaResolveFallback');
    expect(source).toContain('feedMediaVideoSettleHandlers');
    expect(source).toContain('onLoadedMetadata');
    expect(source).toContain('onCanPlay');
    expect(source).toContain('setTimeout');
  });

  it('does not probe a second Image/video for seat ratio (learns from the shown element)', () => {
    const source = readFileSync(join(homeSrc, 'post-media.tsx'), 'utf8');
    expect(source).not.toMatch(/new Image\(\)/);
    expect(source).not.toMatch(/document\.createElement\('video'\)/);
    expect(source).toContain('feedMediaVideoSettleHandlers(markResolved)');
    expect(source).toContain('rememberRatio(video.videoWidth, video.videoHeight)');
    expect(source).toMatch(/mode: 'height'/);
    // setMeasuredRatio updater stays pure — anchor capture is outside it.
    expect(source).toMatch(
      /setMeasuredRatio\(\(current\) =>\s*current != null && Math\.abs\(current - ratio\) < 0\.001 \? current : ratio/
    );
  });
});
