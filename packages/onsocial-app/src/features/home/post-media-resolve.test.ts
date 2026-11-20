import { describe, expect, it } from 'vitest';
import {
  FEED_MEDIA_RESOLVE_FALLBACK_MS,
  clearFeedMediaResolvedSrcs,
  feedMediaResolvedSrcCount,
  rememberFeedMediaResolvedSrcForTest,
} from '@/features/home/post-media';

describe('feed media resolve settle', () => {
  it('names a fallback budget aligned with the SDK poster capture window', () => {
    // Same 8s budget as packages/onsocial-sdk internal/media-poster POSTER_TIMEOUT_MS.
    expect(FEED_MEDIA_RESOLVE_FALLBACK_MS).toBe(8_000);
  });

  it('caps the session resolved-src LRU', () => {
    clearFeedMediaResolvedSrcs();
    for (let index = 0; index < 220; index += 1) {
      rememberFeedMediaResolvedSrcForTest(`https://cdn.example/${index}.jpg`);
    }
    expect(feedMediaResolvedSrcCount()).toBe(200);
    clearFeedMediaResolvedSrcs();
  });
});
