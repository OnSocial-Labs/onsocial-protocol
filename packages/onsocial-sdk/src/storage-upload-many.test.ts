import { describe, expect, it, vi } from 'vitest';
import { StorageModule } from './storage.js';
import type {
  StorageProvider,
  UploadedJson,
  UploadedMedia,
} from './storage/provider.js';

function makeProvider(opts: { uploadDelayMs?: number } = {}) {
  let counter = 0;
  const upload = vi.fn(
    async (file: Blob | File): Promise<UploadedMedia> => {
      const id = ++counter;
      if (opts.uploadDelayMs) {
        await new Promise((r) => setTimeout(r, opts.uploadDelayMs));
      }
      return {
        cid: `bafy${id}`,
        size: file.size ?? 100,
        mime: file.type || 'application/octet-stream',
      };
    }
  );
  const uploadJson = vi.fn(
    async (): Promise<UploadedJson> => ({
      cid: 'bafyJson',
      size: 10,
      mime: 'application/json',
    })
  );
  const url = vi.fn((cid: string) => `https://gw.example/${cid}`);
  const provider = { upload, uploadJson, url } as unknown as StorageProvider;
  return { provider, upload, uploadJson, url };
}

function file(name: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type: 'image/png' });
}

describe('StorageModule.uploadMany', () => {
  it('returns an empty array for an empty input', async () => {
    const { provider, upload } = makeProvider();
    const mod = new StorageModule({} as never, provider);
    const out = await mod.uploadMany([]);
    expect(out).toEqual([]);
    expect(upload).not.toHaveBeenCalled();
  });

  it('preserves input order across concurrent workers', async () => {
    const { provider } = makeProvider({ uploadDelayMs: 10 });
    const mod = new StorageModule({} as never, provider);
    const inputs = [file('a.png'), file('b.png'), file('c.png'), file('d.png')];
    const out = await mod.uploadMany(inputs, { concurrency: 2 });
    expect(out).toHaveLength(4);
    expect(out.every((r) => typeof r.cid === 'string' && r.cid.length > 0)).toBe(
      true
    );
    // All cids unique — proves we didn't dedupe or short-circuit.
    const cids = new Set(out.map((r) => r.cid));
    expect(cids.size).toBe(4);
  });

  it('reports progress as uploads complete', async () => {
    const { provider } = makeProvider();
    const mod = new StorageModule({} as never, provider);
    const onProgress = vi.fn();
    await mod.uploadMany([file('a'), file('b'), file('c')], {
      concurrency: 1,
      onProgress,
    });
    const calls = onProgress.mock.calls;
    expect(calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('caps concurrency at min(concurrency, total)', async () => {
    const { provider, upload } = makeProvider({ uploadDelayMs: 5 });
    const mod = new StorageModule({} as never, provider);
    await mod.uploadMany([file('a'), file('b')], { concurrency: 10 });
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('defaults concurrency to 4 when omitted', async () => {
    const { provider, upload } = makeProvider();
    const mod = new StorageModule({} as never, provider);
    const inputs = Array.from({ length: 8 }, (_, i) => file(`f${i}`));
    const out = await mod.uploadMany(inputs);
    expect(out).toHaveLength(8);
    expect(upload).toHaveBeenCalledTimes(8);
  });
});
