import { isDmDecryptFailureText } from '@/lib/dm/send';

export const DM_INBOX_PREVIEW_MAX_CHARS = 72;
export const DM_INBOX_PREVIEW_MEDIA = 'Photo or video';

export function formatDmInboxPreview(opts: {
  text: string | null | undefined;
  hasMedia?: boolean;
}): string {
  const collapsed = (opts.text ?? '').replace(/\s+/g, ' ').trim();
  if (!collapsed) {
    return opts.hasMedia ? DM_INBOX_PREVIEW_MEDIA : '';
  }
  if (collapsed.length <= DM_INBOX_PREVIEW_MAX_CHARS) return collapsed;
  return `${collapsed.slice(0, DM_INBOX_PREVIEW_MAX_CHARS - 1).trimEnd()}…`;
}

/**
 * Inbox last-line after decrypt. Skip garbage when the envelope will not
 * open; media-only (or failed text with media) still shows a photo label.
 */
export function inboxPreviewFromDecrypted(opts: {
  text: string | undefined;
  hasMedia?: boolean;
}): string {
  const hasMedia = Boolean(opts.hasMedia);
  if (isDmDecryptFailureText(opts.text)) {
    return hasMedia ? DM_INBOX_PREVIEW_MEDIA : '';
  }
  return formatDmInboxPreview({ text: opts.text, hasMedia });
}
