import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareUrl } from '@/lib/share-url';

describe('shareUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns failed for empty url', async () => {
    expect(await shareUrl({ url: '  ' })).toBe('failed');
  });

  it('uses navigator.share when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    await expect(
      shareUrl({ url: 'https://example.com/p', title: 'Post', text: 'Hi' })
    ).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({
      title: 'Post',
      text: 'Hi',
      url: 'https://example.com/p',
    });
  });

  it('treats AbortError as aborted', async () => {
    vi.stubGlobal('navigator', {
      share: vi.fn().mockRejectedValue(new DOMException('nope', 'AbortError')),
    });
    await expect(shareUrl({ url: 'https://example.com/p' })).resolves.toBe(
      'aborted'
    );
  });

  it('falls back to clipboard on NotAllowedError', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      share: vi
        .fn()
        .mockRejectedValue(new DOMException('blocked', 'NotAllowedError')),
      clipboard: { writeText },
    });
    await expect(shareUrl({ url: 'https://example.com/p' })).resolves.toBe(
      'copied'
    );
    expect(writeText).toHaveBeenCalledWith('https://example.com/p');
  });

  it('falls back to clipboard when share is missing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(shareUrl({ url: 'https://example.com/p' })).resolves.toBe(
      'copied'
    );
    expect(writeText).toHaveBeenCalledWith('https://example.com/p');
  });

  it('returns failed when clipboard also fails', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });
    await expect(shareUrl({ url: 'https://example.com/p' })).resolves.toBe(
      'failed'
    );
  });

  it('skips clipboard when the document is not focused', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('document', { hasFocus: () => false });
    vi.stubGlobal('window', { focus: vi.fn() });
    await expect(shareUrl({ url: 'https://example.com/p' })).resolves.toBe(
      'failed'
    );
    expect(writeText).not.toHaveBeenCalled();
  });
});
