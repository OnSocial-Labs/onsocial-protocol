export const WRITE_DOCK_MOBILE_MAX_WIDTH_PX = 767;

export const WRITE_DOCK_MEDIA_ACCEPT =
  'image/jpeg,image/png,image/webp,video/mp4,video/webm';

export function writeDockCanSend(
  text: string,
  fileCount: number,
  disabled = false
): boolean {
  return !disabled && (Boolean(text.trim()) || fileCount > 0);
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
