import { describe, expect, it } from 'vitest';
import { FEED_MEDIA_RESOLVE_FALLBACK_MS } from '@/features/home/post-media';

describe('feed media resolve settle', () => {
  it('names a fallback budget aligned with the SDK poster capture window', () => {
    // Same 8s budget as packages/onsocial-sdk internal/media-poster POSTER_TIMEOUT_MS.
    expect(FEED_MEDIA_RESOLVE_FALLBACK_MS).toBe(8_000);
  });
});
