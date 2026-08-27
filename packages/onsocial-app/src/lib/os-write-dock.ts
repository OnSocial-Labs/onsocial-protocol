import {
  POST_TEXT_MAX_LENGTH,
} from '@/lib/post-display';

export const WRITE_DOCK_MOBILE_MAX_WIDTH_PX = 767;

export const WRITE_DOCK_MEDIA_ACCEPT =
  'image/jpeg,image/png,image/webp,video/mp4,video/webm';

export function writeDockTextRemaining(text: string): number {
  return POST_TEXT_MAX_LENGTH - text.length;
}

/** Compact dock — show the budget whenever there is draft text. */
export function writeDockShowTextCount(text: string): boolean {
  return text.length > 0;
}

export function writeDockCanSend(
  text: string,
  fileCount: number,
  disabled = false
): boolean {
  return (
    !disabled &&
    text.length <= POST_TEXT_MAX_LENGTH &&
    (Boolean(text.trim()) || fileCount > 0)
  );
}

/** Send owns the bar — hide the dead circle until there is something to send. */
export function writeDockShowSend(canSend: boolean, pending = false): boolean {
  return pending || canSend;
}

/** Footer toolbar — media once the compose session opens. */
export function writeDockShowMedia(footerOpen: boolean): boolean {
  return footerOpen;
}

/** Footer toolbar — expand once the compose session opens. */
export function writeDockShowExpand(
  hasExpand: boolean,
  footerOpen: boolean
): boolean {
  return hasExpand && footerOpen;
}

/** One-line dock — media + expand stay visible on the bar until the footer opens. */
export function writeDockShowCompactBarTools(footerOpen: boolean): boolean {
  return !footerOpen;
}

export function writeDockShouldSendOnEnter(
  maxWidthPx = WRITE_DOCK_MOBILE_MAX_WIDTH_PX
): boolean {
  if (typeof window === 'undefined') return false;
  return !window.matchMedia(`(max-width: ${maxWidthPx}px)`).matches;
}

export function writeDockReplyPlaceholder(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? `Reply to ${trimmed}…` : 'Add a reply…';
}

export function writeDockIsThoughtEnlarge(
  feedMediumOpen: boolean,
  mode: string
): boolean {
  return feedMediumOpen && mode === 'viewer';
}

export function writeDockDraftKey(kind: 'post' | 'dm', id: string): string {
  return `${kind}:${id}`;
}
