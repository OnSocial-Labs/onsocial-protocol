import { describe, expect, it } from 'vitest';
import { parsePostMedia } from '@/lib/post-media';

describe('resolvePosterUrl via parsePostMedia', () => {
  it('accepts bare cid / ipfs:// and rejects http(s) and blob posters', () => {
    const bare = parsePostMedia(
      JSON.stringify({
        media: [{ cid: 'bafyvid', mime: 'video/mp4', poster: 'bafyposter' }],
      })
    );
    expect(bare[0]?.posterUrl).toContain('bafyposter');

    const ipfs = parsePostMedia(
      JSON.stringify({
        media: [
          {
            cid: 'bafyvid',
            mime: 'video/mp4',
            poster: 'ipfs://bafyposter2',
          },
        ],
      })
    );
    expect(ipfs[0]?.posterUrl).toContain('bafyposter2');

    for (const poster of [
      'https://evil.example/x.jpg',
      'http://evil.example/x.jpg',
      'blob:https://example/1',
    ]) {
      const items = parsePostMedia(
        JSON.stringify({
          media: [{ cid: 'bafyvid', mime: 'video/mp4', poster }],
        })
      );
      expect(items[0]?.posterUrl).toBeUndefined();
    }
  });
});
