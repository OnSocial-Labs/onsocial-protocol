import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureBlobVideoPoster } from './media-poster.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('captureBlobVideoPoster', () => {
  it('resolves null when the executor throws (orphaned upload path)', async () => {
    const revoke = vi.fn();
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('boom');
      },
    });
    vi.stubGlobal('URL', {
      createObjectURL: () => {
        throw new Error('createObjectURL failed');
      },
      revokeObjectURL: revoke,
    });

    const blob = new Blob([new Uint8Array([1])], { type: 'video/mp4' });
    await expect(captureBlobVideoPoster(blob)).resolves.toBeNull();
    expect(revoke).not.toHaveBeenCalled();
  });

  it('revokes the object URL when createElement throws after createObjectURL', async () => {
    const revoke = vi.fn();
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('boom');
      },
    });
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:poster-probe',
      revokeObjectURL: revoke,
    });

    const blob = new Blob([new Uint8Array([1])], { type: 'video/mp4' });
    await expect(captureBlobVideoPoster(blob)).resolves.toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:poster-probe');
  });
});
