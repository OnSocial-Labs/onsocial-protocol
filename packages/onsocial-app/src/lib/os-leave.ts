/**
 * OS leave — one motion: go up to the parent place.
 * History-back is not the default (deep links / launcher open can leave the OS).
 * Stack panes pass `onBack` (e.g. close a Messages thread).
 */
export function resolveOsLeave({
  onBack,
  fallbackHref,
}: {
  onBack?: () => void;
  fallbackHref: string;
}): { kind: 'callback' } | { kind: 'parent'; href: string } {
  if (onBack) return { kind: 'callback' };
  return { kind: 'parent', href: fallbackHref };
}
