import { describe, expect, it } from 'vitest';
import {
  POST_VIDEO_MAX_ENCODED_BYTES,
  POST_VIDEO_MAX_SECONDS,
  POST_VIDEO_MAX_UPLOAD_BYTES,
  encodePostVideo,
  isEncodableVideoMime,
} from '../../src/services/storage/encode-post-video.js';

describe('encode-post-video constants', () => {
  it('matches the agreed feed clip budget', () => {
    expect(POST_VIDEO_MAX_SECONDS).toBe(120);
    expect(POST_VIDEO_MAX_UPLOAD_BYTES).toBe(200 * 1024 * 1024);
    expect(POST_VIDEO_MAX_ENCODED_BYTES).toBe(50 * 1024 * 1024);
  });

  it('isEncodableVideoMime accepts video/* only', () => {
    expect(isEncodableVideoMime('video/mp4')).toBe(true);
    expect(isEncodableVideoMime('video/quicktime')).toBe(true);
    expect(isEncodableVideoMime('audio/mpeg')).toBe(false);
    expect(isEncodableVideoMime('image/png')).toBe(false);
  });
});

describe('encodePostVideo guards', () => {
  it('rejects oversized inbound buffers before ffmpeg', async () => {
    // Avoid allocating 200 MB — only `length` is checked before write.
    const huge = Buffer.alloc(1);
    Object.defineProperty(huge, 'length', {
      value: POST_VIDEO_MAX_UPLOAD_BYTES + 1,
    });
    await expect(
      encodePostVideo({ buffer: huge, mimetype: 'video/mp4' })
    ).rejects.toMatchObject({
      name: 'VideoEncodeError',
      status: 400,
      message: expect.stringMatching(/200 MB/i),
    });
  });
});
