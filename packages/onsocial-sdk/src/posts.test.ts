import { describe, expect, it, vi } from 'vitest';
import { SocialModule, resolvePostMedia } from './social.js';
import type { StorageProvider } from './storage/provider.js';

function makeProvider(): StorageProvider & { uploads: Array<Blob | File> } {
  const uploads: Array<Blob | File> = [];
  return {
    uploads,
    upload: vi.fn(async (file: Blob | File) => {
      uploads.push(file);
      return {
        cid: `bafy-${uploads.length}`,
        mime: file.type || 'application/octet-stream',
        size: file.size,
      };
    }),
    uploadJson: vi.fn(async () => ({
      cid: 'bafy-json',
      mime: 'application/json',
      size: 0,
    })),
    url: (cid: string) => `https://cdn/${cid}`,
  } as unknown as StorageProvider & { uploads: Array<Blob | File> };
}

describe('resolvePostMedia', () => {
  it('returns input unchanged when no files / image', async () => {
    const provider = makeProvider();
    const post = { text: 'hi' } as const;
    const out = await resolvePostMedia(post, provider);
    expect(out).toBe(post);
  });

  it('uploads files[] and emits MediaRef entries with mime/size', async () => {
    const provider = makeProvider();
    const cover = new File(['cover'], 'cover.webp', { type: 'image/webp' });
    const audio = new File(['audio'], 'song.mp3', { type: 'audio/mpeg' });
    const out = await resolvePostMedia(
      { text: 'new track', files: [audio, cover] },
      provider
    );
    expect('files' in out).toBe(false);
    expect(out.media).toEqual([
      { cid: 'bafy-1', mime: 'audio/mpeg', size: audio.size },
      { cid: 'bafy-2', mime: 'image/webp', size: cover.size },
    ]);
  });

  it('prepends image:File as ipfs:// string (legacy path)', async () => {
    const provider = makeProvider();
    const img = new File(['img'], 'x.png', { type: 'image/png' });
    const out = await resolvePostMedia(
      { text: 'gm', image: img, media: ['ipfs://existing'] },
      provider
    );
    expect('image' in out).toBe(false);
    expect(out.media).toEqual(['ipfs://bafy-1', 'ipfs://existing']);
  });

  it('merges image + files + pre-existing media, image first', async () => {
    const provider = makeProvider();
    const img = new File(['img'], 'x.png', { type: 'image/png' });
    const f1 = new File(['f1'], 'f1.webp', { type: 'image/webp' });
    const out = await resolvePostMedia(
      {
        text: 'mixed',
        image: img,
        files: [f1],
        media: ['ipfs://preexisting'],
      },
      provider
    );
    expect(out.media).toEqual([
      'ipfs://bafy-1',
      { cid: 'bafy-2', mime: 'image/webp', size: f1.size },
      'ipfs://preexisting',
    ]);
  });

  it('passes through arbitrary custom fields unchanged', async () => {
    const provider = makeProvider();
    const file = new File(['x'], 'x.webp', { type: 'image/webp' });
    const out = await resolvePostMedia(
      {
        text: 'hi',
        files: [file],
        channel: 'music',
        x: { myApp: { gameId: 'g1' } },
        customTopLevel: 'keep me',
      },
      provider
    );
    expect(out.channel).toBe('music');
    expect(out.x).toEqual({ myApp: { gameId: 'g1' } });
    expect(out.customTopLevel).toBe('keep me');
  });
});

describe('SocialModule.post with files[]', () => {
  it('uploads each file via the provider and writes MediaRef entries', async () => {
    const postSpy = vi.fn().mockResolvedValue({ txHash: 'tx' });
    const provider = makeProvider();
    const social = new SocialModule(
      {
        post: postSpy,
        network: 'testnet',
      } as never,
      provider
    );
    const audio = new File(['a'], 'a.mp3', { type: 'audio/mpeg' });
    const cover = new File(['c'], 'c.webp', { type: 'image/webp' });

    await social.post(
      { text: 'new track', files: [audio, cover], channel: 'music' },
      'p-1'
    );

    expect(provider.upload).toHaveBeenCalledTimes(2);
    const [, body] = postSpy.mock.calls[0];
    expect(body.path).toBe('post/p-1');
    const stored = JSON.parse(body.value);
    expect(stored.media).toEqual([
      { cid: 'bafy-1', mime: 'audio/mpeg', size: audio.size },
      { cid: 'bafy-2', mime: 'image/webp', size: cover.size },
    ]);
    expect(stored.channel).toBe('music');
    expect(stored.kind).toBe('audio'); // inferKind saw audio/* mime
    expect(stored.files).toBeUndefined();
  });
});
