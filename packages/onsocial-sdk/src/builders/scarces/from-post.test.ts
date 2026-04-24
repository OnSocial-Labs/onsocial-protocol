import { describe, expect, it } from 'vitest';
import { extractPostMedia } from './from-post.js';

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
});
