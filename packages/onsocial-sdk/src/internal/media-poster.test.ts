import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureBlobVideoPoster } from './media-poster.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('captureBlobVideoPoster', () => {
  it('resolves null when the executor throws (orphaned upload path)', async () => {
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('boom');
      },
    });
    vi.stubGlobal('URL', {
      createObjectURL: () => {
        throw new Error('createObjectURL failed');
      },
      revokeObjectURL: vi.fn(),
    });

    const blob = new Blob([new Uint8Array([1])], { type: 'video/mp4' });
    await expect(captureBlobVideoPoster(blob)).resolves.toBeNull();
  });
});
