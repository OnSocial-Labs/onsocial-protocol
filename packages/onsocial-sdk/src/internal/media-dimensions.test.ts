import { describe, expect, it } from 'vitest';
import { probeBlobDimensions } from './media-dimensions.js';

// Vitest runs the SDK suite in Node — no DOM, no Image/video elements — so
// every probe must resolve `{}` (best-effort hints, never a failure mode).
describe('probeBlobDimensions (no DOM)', () => {
  it('resolves {} for images without a browser runtime', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    await expect(probeBlobDimensions(blob, 'image/png')).resolves.toEqual({});
  });

  it('resolves {} for videos without a browser runtime', async () => {
    const blob = new Blob(['x'], { type: 'video/mp4' });
    await expect(probeBlobDimensions(blob, 'video/mp4')).resolves.toEqual({});
  });

  it('resolves {} for non-visual media regardless of runtime', async () => {
    const blob = new Blob(['x'], { type: 'audio/mpeg' });
    await expect(probeBlobDimensions(blob, 'audio/mpeg')).resolves.toEqual({});
    await expect(probeBlobDimensions(blob, '')).resolves.toEqual({});
  });
});
