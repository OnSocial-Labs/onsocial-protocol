import { describe, expect, it } from 'vitest';
import { extractPostMedia, inferPostScarceKind } from './from-post.js';

describe('extractPostMedia', () => {
  it('parses string body and surfaces first MediaRef cid', () => {
    const out = extractPostMedia(
      JSON.stringify({
        text: 'hello world',
        media: [
          { cid: 'bafyMedia1', mime: 'image/webp', size: 100 },
          'ipfs://bafyMedia2',
        ],
      })
    );
    expect(out.text).toBe('hello world');
    expect(out.mediaCid).toBe('bafyMedia1');
    expect(out.media).toHaveLength(2);
  });

  it('falls back to ipfs:// string when no MediaRef present', () => {
    const out = extractPostMedia(
      JSON.stringify({ text: 't', media: ['ipfs://onlyString'] })
    );
    expect(out.mediaCid).toBe('onlyString');
  });

  it('returns empty media when post has no media', () => {
    const out = extractPostMedia(JSON.stringify({ text: 'plain' }));
    expect(out.text).toBe('plain');
    expect(out.mediaCid).toBeUndefined();
    expect(out.media).toEqual([]);
  });

  it('handles unparseable strings gracefully', () => {
    const out = extractPostMedia('not json');
    expect(out.text).toBe('not json');
    expect(out.mediaCid).toBeUndefined();
  });

  it('handles null / undefined', () => {
    expect(extractPostMedia(null).media).toEqual([]);
    expect(extractPostMedia(undefined).text).toBe('');
  });

  it('skips video / audio entries (would render broken as NFT artwork)', () => {
    const out = extractPostMedia(
      JSON.stringify({
        text: 'mixed media post',
        media: [
          { cid: 'bafyVid', mime: 'video/mp4' },
          { cid: 'bafyAud', mime: 'audio/mpeg' },
          { cid: 'bafyImg', mime: 'image/png' },
        ],
      })
    );
    // First *image* wins, not first entry.
    expect(out.mediaCid).toBe('bafyImg');
    expect(out.mediaCids).toEqual(['bafyImg']);
    // Raw `media` is preserved untouched for callers who need it.
    expect(out.media).toHaveLength(3);
    // …but they are kept as playable refs so the scarce can point at them.
    expect(out.playable).toEqual([
      { cid: 'bafyVid', mime: 'video/mp4' },
      { cid: 'bafyAud', mime: 'audio/mpeg' },
    ]);
  });

  it('surfaces a video-only post as playable with no cover image', () => {
    const out = extractPostMedia(
      JSON.stringify({
        text: 'clip',
        media: [{ cid: 'bafyVid', mime: 'video/webm' }],
      })
    );
    expect(out.mediaCid).toBeUndefined();
    expect(out.mediaCids).toEqual([]);
    expect(out.playable).toEqual([{ cid: 'bafyVid', mime: 'video/webm' }]);
  });

  it('leaves playable empty for image-only posts', () => {
    const out = extractPostMedia(
      JSON.stringify({
        text: 'photo',
        media: [{ cid: 'a', mime: 'image/png' }],
      })
    );
    expect(out.playable).toEqual([]);
  });

  it('collects all image CIDs in source order for multi-photo posts', () => {
    const out = extractPostMedia(
      JSON.stringify({
        text: 'gallery',
        media: [
          { cid: 'bafyA', mime: 'image/jpeg' },
          { cid: 'bafyB', mime: 'image/png' },
          { cid: 'bafyC', mime: 'image/webp' },
        ],
      })
    );
    expect(out.mediaCid).toBe('bafyA');
    expect(out.mediaCids).toEqual(['bafyA', 'bafyB', 'bafyC']);
  });

  it('treats string-only entries as image when MIME is unavailable', () => {
    const out = extractPostMedia(
      JSON.stringify({ text: 'old-format', media: ['ipfs://oldFormatOne'] })
    );
    expect(out.mediaCids).toEqual(['oldFormatOne']);
  });
});

describe('inferPostScarceKind', () => {
  it('maps text-only posts to thought', () => {
    expect(inferPostScarceKind({ mediaCids: [], playable: [] })).toBe(
      'thought'
    );
  });

  it('maps image posts to art', () => {
    expect(inferPostScarceKind({ mediaCids: ['bafyImg'], playable: [] })).toBe(
      'art'
    );
  });

  it('maps audio playable to music', () => {
    expect(
      inferPostScarceKind({
        mediaCids: ['bafyCover'],
        playable: [{ cid: 'bafyAud', mime: 'audio/mpeg' }],
      })
    ).toBe('music');
  });

  it('maps video playable to video (over art cover)', () => {
    expect(
      inferPostScarceKind({
        mediaCids: ['bafyFrame'],
        playable: [{ cid: 'bafyVid', mime: 'video/mp4' }],
      })
    ).toBe('video');
  });

  it('prefers video when both video and audio are present', () => {
    expect(
      inferPostScarceKind({
        mediaCids: [],
        playable: [
          { cid: 'bafyAud', mime: 'audio/mpeg' },
          { cid: 'bafyVid', mime: 'video/webm' },
        ],
      })
    ).toBe('video');
  });
});
