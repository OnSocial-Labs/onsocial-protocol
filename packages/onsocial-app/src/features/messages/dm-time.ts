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

/** Local calendar day key (`YYYY-MM-DD`) for thread day rules. */
export function dmLocalDayKey(iso: string | null | undefined): string | null {
  const date = parseDmDate(iso);
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Thread day rule — Today / Yesterday / weekday date. */
export function formatDmDaySeparator(
  iso: string | null | undefined,
  now: Date = new Date()
): string {
  const date = parseDmDate(iso);
  if (!date) return '';
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  const diffDays = Math.round(
    (startToday.getTime() - startThat.getTime()) / 86_400_000
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (date.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(ABSOLUTE_LOCALE, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(date);
  }
  return new Intl.DateTimeFormat(ABSOLUTE_LOCALE, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
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

/**
 * Clock time on thread bubbles — day rules own the calendar; bubbles show
 * when in the day (iMessage / WhatsApp pattern), not feed-style `2d` / `40m`.
 */
export function formatDmBubbleTime(iso: string | null | undefined): string {
  const date = parseDmDate(iso);
  if (!date) return '';
  return new Intl.DateTimeFormat(ABSOLUTE_LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
