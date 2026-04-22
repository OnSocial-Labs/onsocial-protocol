import { describe, expect, it, vi } from 'vitest';
import {
  GatewayProvider,
  LighthouseProvider,
  probeFile,
  resolveStorageProvider,
  type StorageProvider,
} from './provider.js';
import type { HttpClient } from '../http.js';

function mockHttp(overrides: Record<string, unknown> = {}): HttpClient {
  return {
    requestForm: vi.fn(async () => ({ cid: 'bafy-gw', size: 42 })),
    post: vi.fn(async () => ({ cid: 'bafy-gw-json', size: 17 })),
    get: vi.fn(),
    network: 'testnet',
    ...overrides,
  } as unknown as HttpClient;
}

describe('probeFile', () => {
  it('falls back to application/octet-stream when type is missing', () => {
    const blob = new Blob(['hello']);
    expect(probeFile(blob).mime).toBe('application/octet-stream');
    expect(probeFile(blob).size).toBe(5);
  });

  it('reads file.type when present', () => {
    const blob = new Blob(['{}'], { type: 'application/json' });
    expect(probeFile(blob)).toEqual({
      mime: 'application/json',
      size: 2,
    });
  });
});

describe('GatewayProvider', () => {
  it('uploads via /storage/upload and returns UploadedMedia', async () => {
    const http = mockHttp({
      requestForm: vi.fn(async () => ({
        cid: 'bafyA',
        size: 100,
        mime: 'image/webp',
      })),
    });
    const gw = new GatewayProvider(http);
    const out = await gw.upload(new Blob(['x'], { type: 'image/webp' }));
    expect(out).toEqual({ cid: 'bafyA', size: 100, mime: 'image/webp' });
    expect(http.requestForm).toHaveBeenCalledWith(
      'POST',
      '/storage/upload',
      expect.any(FormData)
    );
  });

  it('falls back to probed mime/size if gateway omits them', async () => {
    const http = mockHttp({
      requestForm: vi.fn(async () => ({ cid: 'bafyB' })),
    });
    const gw = new GatewayProvider(http);
    const out = await gw.upload(new Blob(['hello'], { type: 'text/plain' }));
    expect(out).toEqual({ cid: 'bafyB', mime: 'text/plain', size: 5 });
  });

  it('coerces gateway string sizes to numbers', async () => {
    const http = mockHttp({
      requestForm: vi.fn(
        async () =>
          ({
            cid: 'bafyS',
            size: '12',
            mime: 'audio/mpeg',
          }) as unknown as { cid: string }
      ),
      post: vi.fn(
        async () => ({ cid: 'bafyJ', size: '19' }) as unknown as { cid: string }
      ),
    });
    const gw = new GatewayProvider(http);

    const fileOut = await gw.upload(
      new Blob(['hello world!'], { type: 'audio/mpeg' })
    );
    expect(fileOut).toEqual({ cid: 'bafyS', mime: 'audio/mpeg', size: 12 });

    const jsonOut = await gw.uploadJson({ hello: 'world' });
    expect(jsonOut).toEqual({
      cid: 'bafyJ',
      mime: 'application/json',
      size: 19,
    });
  });

  it('uploads JSON via /storage/upload-json', async () => {
    const http = mockHttp({
      post: vi.fn(async () => ({ cid: 'bafyJ', size: 9 })),
    });
    const gw = new GatewayProvider(http);
    const out = await gw.uploadJson({ hello: 'world' });
    expect(out.cid).toBe('bafyJ');
    expect(out.mime).toBe('application/json');
    expect(http.post).toHaveBeenCalledWith('/storage/upload-json', {
      hello: 'world',
    });
  });

  it('returns the Lighthouse gateway URL', () => {
    const gw = new GatewayProvider(mockHttp());
    expect(gw.url('bafy123')).toBe(
      'https://gateway.lighthouse.storage/ipfs/bafy123'
    );
  });
});

describe('LighthouseProvider', () => {
  it('refuses construction without an API key', () => {
    expect(() => new LighthouseProvider('')).toThrow(/apiKey/);
  });

  it('POSTs to node.lighthouse.storage with Bearer auth', async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({
            Name: 'f.bin',
            Hash: 'bafy-direct',
            Size: '77',
          }),
        }) as unknown as Response
    );
    const lh = new LighthouseProvider('lh-test-key', fetchMock);
    const out = await lh.upload(new Blob(['hi'], { type: 'text/plain' }));
    expect(out).toEqual({
      cid: 'bafy-direct',
      mime: 'text/plain',
      size: 77,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://node.lighthouse.storage/api/v0/add',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer lh-test-key',
        }),
      })
    );
  });

  it('throws on non-2xx', async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: false,
          status: 401,
          text: async () => 'unauthorized',
        }) as unknown as Response
    );
    const lh = new LighthouseProvider('bad-key', fetchMock);
    await expect(lh.upload(new Blob(['x']))).rejects.toThrow(/HTTP 401/);
  });

  it('throws when response has no Hash', async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ Name: 'x', Size: '0' }),
        }) as unknown as Response
    );
    const lh = new LighthouseProvider('key', fetchMock);
    await expect(lh.upload(new Blob(['y']))).rejects.toThrow(/missing CID/);
  });
});

describe('resolveStorageProvider', () => {
  it('defaults to GatewayProvider when config is omitted', () => {
    const p = resolveStorageProvider(undefined, mockHttp());
    expect(p).toBeInstanceOf(GatewayProvider);
  });

  it("resolves { provider: 'gateway' }", () => {
    const p = resolveStorageProvider({ provider: 'gateway' }, mockHttp());
    expect(p).toBeInstanceOf(GatewayProvider);
  });

  it("resolves { provider: 'lighthouse', apiKey }", () => {
    const p = resolveStorageProvider(
      { provider: 'lighthouse', apiKey: 'k' },
      mockHttp()
    );
    expect(p).toBeInstanceOf(LighthouseProvider);
  });

  it("resolves { provider: 'custom', impl }", () => {
    const impl: StorageProvider = {
      upload: async () => ({ cid: 'c', mime: 'text/plain', size: 0 }),
      uploadJson: async () => ({
        cid: 'c',
        mime: 'application/json',
        size: 0,
      }),
      url: (cid) => `https://cdn/${cid}`,
    };
    const p = resolveStorageProvider({ provider: 'custom', impl }, mockHttp());
    expect(p).toBe(impl);
  });

  it('passes through inline StorageProvider instances', () => {
    const impl: StorageProvider = {
      upload: async () => ({ cid: 'c', mime: 'text/plain', size: 0 }),
      uploadJson: async () => ({
        cid: 'c',
        mime: 'application/json',
        size: 0,
      }),
      url: (cid) => `x/${cid}`,
    };
    expect(resolveStorageProvider(impl, mockHttp())).toBe(impl);
  });
});
