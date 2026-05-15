import { describe, expect, it, vi } from 'vitest';
import {
  filenameForLighthouse,
  uploadNamedBufferToLighthouse,
} from '../../src/services/storage/lighthouse-upload.js';

describe('filenameForLighthouse', () => {
  it('keeps safe filenames with extensions', () => {
    expect(filenameForLighthouse('scarce-card.png', 'image/png')).toBe(
      'scarce-card.png'
    );
  });

  it('sanitizes paths and adds a MIME-derived extension', () => {
    expect(filenameForLighthouse('../My Avatar', 'image/webp')).toBe(
      'My_Avatar.webp'
    );
  });

  it('falls back for empty names', () => {
    expect(filenameForLighthouse('', 'text/plain')).toBe('upload.txt');
  });
});

describe('uploadNamedBufferToLighthouse', () => {
  it('uploads a named MIME-aware multipart file', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            Hash: 'bafyNamedUpload',
            Size: '4',
            Name: 'art.png',
          }),
          { status: 200 }
        )
    );

    const result = await uploadNamedBufferToLighthouse({
      buffer: Buffer.from('test'),
      apiKey: 'lh-key',
      filename: 'art.png',
      mime: 'image/png',
      storageType: 'annual',
      endpointBase: 'https://node.example',
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({
      Hash: 'bafyNamedUpload',
      Size: '4',
      Name: 'art.png',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://node.example/api/v0/add?cid-version=1',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer lh-key',
          'X-Storage-Type': 'annual',
        },
      })
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const form = request.body as FormData;
    const uploaded = form.get('file') as File;
    expect(uploaded.name).toBe('art.png');
    expect(uploaded.type).toBe('image/png');
    expect(await uploaded.text()).toBe('test');
  });

  it('defaults to the Lighthouse upload host used by the SDK', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ Hash: 'bafyDefaultHost', Size: '1' }), {
          status: 200,
        })
    );

    await uploadNamedBufferToLighthouse({
      buffer: Buffer.from('x'),
      apiKey: 'lh-key',
      fetchImpl: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://upload.lighthouse.storage/api/v0/add?cid-version=1',
      expect.any(Object)
    );
  });

  it('surfaces Lighthouse errors with context', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'bad upload' }), { status: 429 })
    );

    await expect(
      uploadNamedBufferToLighthouse({
        buffer: Buffer.from('x'),
        apiKey: 'lh-key',
        fetchImpl: fetchMock,
      })
    ).rejects.toThrow('Lighthouse upload failed (429): bad upload');
  });
});
