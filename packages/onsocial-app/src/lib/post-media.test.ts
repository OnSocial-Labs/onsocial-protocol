import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  POST_MEDIA_MAX_FILES,
  POST_VIDEO_MAX_BYTES,
  POST_VIDEO_MAX_SECONDS,
  appendPostMediaIndex,
  appendPostMediaUnmute,
  applyMediaKindOverride,
  formatMediaDuration,
  isPostVideoMime,
  mediaKindFromFile,
  parsePostMedia,
  postMediaStripClassName,
  readPostMediaUnmuteIndex,
  revokeDroppedOptimisticMedia,
  revokeOptimisticMediaPreviewUrls,
  truncateQuoteText,
} from '@/lib/post-media';

describe('post video caps', () => {
  it('allows 120s / 200 MB inbound (gateway encodes to ≤50 MB)', () => {
    expect(POST_VIDEO_MAX_SECONDS).toBe(120);
    expect(POST_VIDEO_MAX_BYTES).toBe(200 * 1024 * 1024);
    expect(POST_MEDIA_MAX_FILES).toBe(4);
    expect(isPostVideoMime('video/mp4')).toBe(true);
    expect(isPostVideoMime('video/quicktime')).toBe(true);
  });
});

describe('parsePostMedia', () => {
  it('returns empty for invalid or missing bodies', () => {
    expect(parsePostMedia(null)).toEqual([]);
    expect(parsePostMedia('not-json')).toEqual([]);
    expect(parsePostMedia('{"v":1,"text":"hi"}')).toEqual([]);
  });

  it('resolves MediaRef entries with mime + cid', () => {
    const items = parsePostMedia(
      JSON.stringify({
        v: 1,
        media: [{ cid: 'bafytest', mime: 'video/mp4', size: 12 }],
      })
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.mime).toBe('video/mp4');
    expect(items[0]?.cid).toBe('bafytest');
    expect(items[0]?.url).toContain('bafytest');
  });

  it('prefers previewUrl for optimistic blobs', () => {
    const items = parsePostMedia(
      JSON.stringify({
        media: [
          {
            cid: 'preview',
            mime: 'image/png',
            previewUrl: 'blob:https://example/preview-1',
          },
        ],
      })
    );
    expect(items[0]?.url).toBe('blob:https://example/preview-1');
    expect(items[0]?.cid).toBeUndefined();
  });

  it('caps at four items', () => {
    const media = Array.from({ length: 6 }, (_, i) => ({
      cid: `cid-${i}`,
      mime: 'image/png',
    }));
    expect(parsePostMedia(JSON.stringify({ media }))).toHaveLength(4);
  });
});

describe('media kind helpers', () => {
  it('mediaKindFromFile maps image/video mimes', () => {
    expect(
      mediaKindFromFile(new File([], 'a.png', { type: 'image/png' }))
    ).toBe('image');
    expect(
      mediaKindFromFile(new File([], 'a.mp4', { type: 'video/mp4' }))
    ).toBe('video');
  });

  it('applyMediaKindOverride replaces inherited text kind', () => {
    const file = new File([], 'clip.mp4', { type: 'video/mp4' });
    expect(
      applyMediaKindOverride({ channel: 'general', kind: 'text' }, [file])
    ).toEqual({ channel: 'general', kind: 'video' });
  });

  it('applyMediaKindOverride drops kind when mime is unknown', () => {
    const file = new File([], 'x.bin', { type: 'application/octet-stream' });
    expect(applyMediaKindOverride({ kind: 'text' }, [file])).toEqual({});
  });
});

describe('collage + unmute helpers', () => {
  it('postMediaStripClassName builds collage vs carousel classes', () => {
    expect(postMediaStripClassName({ count: 1 })).toBe(
      'post-media-strip post-media-strip--1'
    );
    expect(postMediaStripClassName({ count: 3 })).toBe(
      'post-media-strip post-media-strip--3 is-collage'
    );
    expect(
      postMediaStripClassName({ count: 3, focused: true, page: true })
    ).toBe(
      'post-media-strip post-media-strip--3 is-carousel is-focused is-page'
    );
    expect(postMediaStripClassName({ count: 2, quote: true })).toBe(
      'post-media-strip post-media-strip--2 is-collage is-quote'
    );
  });

  it('appendPostMediaUnmute adds query params', () => {
    expect(appendPostMediaUnmute('/@a/posts/1')).toBe(
      '/@a/posts/1?media=unmute'
    );
    expect(appendPostMediaUnmute('/@a/posts/1', 2)).toBe(
      '/@a/posts/1?media=unmute&mi=2'
    );
    expect(appendPostMediaUnmute('/@a/posts/1?x=1', 1)).toBe(
      '/@a/posts/1?x=1&media=unmute&mi=1'
    );
  });

  it('appendPostMediaIndex adds mi only', () => {
    expect(appendPostMediaIndex('/@a/posts/1', 0)).toBe('/@a/posts/1');
    expect(appendPostMediaIndex('/@a/posts/1', 2)).toBe('/@a/posts/1?mi=2');
  });

  it('readPostMediaUnmuteIndex parses mi', () => {
    expect(
      readPostMediaUnmuteIndex({ get: (name) => (name === 'mi' ? '2' : null) })
    ).toBe(2);
    expect(readPostMediaUnmuteIndex({ get: () => null })).toBe(0);
  });

  it('formatMediaDuration and truncateQuoteText', () => {
    expect(formatMediaDuration(12.4)).toBe('0:12');
    expect(formatMediaDuration(65)).toBe('1:05');
    expect(truncateQuoteText('short')).toBe('short');
    expect(truncateQuoteText('a'.repeat(200)).endsWith('…')).toBe(true);
    expect(truncateQuoteText('a'.repeat(200)).length).toBe(121);
  });
});

describe('revokeOptimisticMediaPreviewUrls', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('revokes blob preview URLs only', () => {
    const revoke = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});
    revokeOptimisticMediaPreviewUrls(
      JSON.stringify({
        media: [
          { cid: 'preview', mime: 'image/png', previewUrl: 'blob:a' },
          { cid: 'bafy', mime: 'image/png', previewUrl: 'https://cdn/x' },
        ],
      })
    );
    expect(revoke).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:a');
  });

  it('revokeDroppedOptimisticMedia only drops missing keys', () => {
    const revoke = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});
    revokeDroppedOptimisticMedia(
      [
        {
          accountId: 'a',
          postId: '1',
          value: JSON.stringify({
            media: [
              { previewUrl: 'blob:keep', mime: 'image/png', cid: 'preview' },
            ],
          }),
        },
        {
          accountId: 'a',
          postId: '2',
          value: JSON.stringify({
            media: [
              { previewUrl: 'blob:drop', mime: 'image/png', cid: 'preview' },
            ],
          }),
        },
      ],
      [{ accountId: 'a', postId: '1' }]
    );
    expect(revoke).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:drop');
  });
});
