import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureBlobVideoPoster } from './media-poster.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
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

  it('falls back to a JPEG when the poster seek hangs', async () => {
    vi.useFakeTimers();
    const jpeg = installPosterDom({ duration: 10, fireSeek: false });
    const pending = captureBlobVideoPoster(
      new Blob([new Uint8Array([1])], { type: 'video/mp4' })
    );
    const raced = await Promise.race([
      pending,
      vi.advanceTimersByTimeAsync(2_000).then(() => 'still-pending' as const),
    ]);
    expect(raced).toBe(jpeg);
    expect(raced).toBeInstanceOf(Blob);
    if (raced instanceof Blob) expect(raced.type).toBe('image/jpeg');
  });

  it('grabs a JPEG from seeked or canplay when fallback readyState is below HAVE_CURRENT_DATA', async () => {
    vi.useFakeTimers();
    const jpeg = installPosterDom({
      duration: 10,
      fireSeek: false,
      readyState: 1,
      frameEvent: 'canplay',
    });
    const pending = captureBlobVideoPoster(
      new Blob([new Uint8Array([1])], { type: 'video/mp4' })
    );
    const raced = await Promise.race([
      pending,
      vi
        .advanceTimersByTimeAsync(2_000)
        .then(() => 'still-pending' as const),
    ]);
    expect(raced).toBe(jpeg);
    expect(raced).toBeInstanceOf(Blob);
    if (raced instanceof Blob) expect(raced.type).toBe('image/jpeg');
  });

  it('captures a still from an empty-MIME .mp4', async () => {
    const jpeg = installPosterDom({ duration: 0, fireSeek: false });
    const frame = await captureBlobVideoPoster(
      new File([new Uint8Array([1])], 'clip.mp4', { type: '' })
    );
    expect(frame).toBe(jpeg);
    expect(frame?.type).toBe('image/jpeg');
  });
});

function installPosterDom(options: {
  duration: number;
  fireSeek: boolean;
  readyState?: number;
  frameEvent?: 'seeked' | 'canplay';
}) {
  const jpeg = new Blob([Uint8Array.from([0xff, 0xd8, 0xff])], {
    type: 'image/jpeg',
  });
  vi.stubGlobal('document', {
    createElement(tag: string) {
      if (tag === 'canvas') {
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage() {},
          }),
          toBlob(
            cb: (frame: Blob | null) => void,
            type?: string,
            quality?: number
          ) {
            expect(type).toBe('image/jpeg');
            expect(quality).toBe(0.85);
            expect(canvas.width).toBe(1280);
            expect(canvas.height).toBe(720);
            cb(jpeg);
          },
        };
        return canvas;
      }
      const video: Record<string, unknown> = {
        muted: false,
        playsInline: false,
        preload: '',
        videoWidth: 1920,
        videoHeight: 1080,
        duration: options.duration,
        readyState: options.readyState ?? 2,
        onloadedmetadata: null as null | (() => void),
        onseeked: null as null | (() => void),
        onerror: null as null | (() => void),
        removeAttribute() {},
        load() {},
        addEventListener(name: string, fn: () => void) {
          listeners[name]?.add(fn);
        },
        removeEventListener(name: string, fn: () => void) {
          listeners[name]?.delete(fn);
        },
      };
      const listeners: Record<string, Set<() => void>> = {
        loadeddata: new Set(),
        seeked: new Set(),
        canplay: new Set(),
      };
      let time = 0;
      Object.defineProperty(video, 'currentTime', {
        configurable: true,
        get: () => time,
        set(next: number) {
          time = next;
          if (options.fireSeek) {
            const onseeked = video.onseeked as null | (() => void);
            onseeked?.();
            return;
          }
          if (next === 0 && options.frameEvent) {
            const name = options.frameEvent;
            setTimeout(() => {
              for (const fn of [...(listeners[name] ?? [])]) fn();
            }, 0);
          }
        },
      });
      Object.defineProperty(video, 'src', {
        configurable: true,
        set() {
          const onloadedmetadata = video.onloadedmetadata as
            | null
            | (() => void);
          onloadedmetadata?.();
        },
      });
      return video;
    },
  });
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:poster',
    revokeObjectURL: () => {},
  });
  return jpeg;
}
