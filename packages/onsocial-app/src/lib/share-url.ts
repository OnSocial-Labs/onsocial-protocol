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
      // User dismissed the sheet — stay silent. Permission / policy failures
      // fall through to clipboard so share still does something.
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        return 'aborted';
      }
    }
  }

  try {
    // Share / picker sheets often leave the document unfocused; writing then
    // throws NotAllowedError. Refocus when we can, otherwise skip quietly.
    if (typeof document !== 'undefined' && !document.hasFocus()) {
      window.focus?.();
    }
    if (typeof document !== 'undefined' && !document.hasFocus()) {
      return 'failed';
    }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
