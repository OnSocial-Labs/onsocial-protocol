/**
 * Share a URL via the system share sheet when available, else copy to clipboard.
 */
export type ShareUrlResult = 'shared' | 'copied' | 'aborted' | 'failed';

export async function shareUrl(input: {
  url: string;
  title?: string;
  text?: string;
}): Promise<ShareUrlResult> {
  const url = input.url.trim();
  if (!url) return 'failed';

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
        ...(input.text?.trim() ? { text: input.text.trim() } : {}),
        url,
      });
      return 'shared';
    } catch (cause) {
      if (
        cause instanceof DOMException &&
        (cause.name === 'AbortError' || cause.name === 'NotAllowedError')
      ) {
        return 'aborted';
      }
      // Fall through to clipboard when share isn’t available for this payload.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
