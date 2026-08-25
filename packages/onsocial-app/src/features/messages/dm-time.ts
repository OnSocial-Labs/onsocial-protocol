import { formatRelativePostTimestamp } from '@/lib/post-display';

const ABSOLUTE_LOCALE = 'en-US';

/** Parse a DM ISO timestamp. Empty / invalid input returns null. */
export function parseDmDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Compact inbox / bubble time — same `now` / `5m` / `2h` / `3d` / short date
 * voice as the feed. DMs store ISO strings, not NEAR block timestamps.
 */
export function formatRelativeDmTime(
  iso: string | null | undefined,
  now: Date = new Date()
): string {
  const date = parseDmDate(iso);
  if (!date) return '';
  return formatRelativePostTimestamp(date.getTime(), now);
}

/** Absolute time for `title` / `dateTime` hover precision. */
export function formatAbsoluteDmTime(iso: string | null | undefined): string {
  const date = parseDmDate(iso);
  if (!date) return '';
  return new Intl.DateTimeFormat(ABSOLUTE_LOCALE, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
