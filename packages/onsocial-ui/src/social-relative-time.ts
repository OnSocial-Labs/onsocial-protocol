export function normalizeSocialTimestamp(value?: number | null): number | null {
  if (!value || !Number.isFinite(value) || value <= 0) return null;
  if (value > 1_000_000_000_000_000) return Math.floor(value / 1_000_000);
  if (value < 1_000_000_000_000) return value * 1000;
  return value;
}

function formatShortYear(year: number): string {
  return `'${String(year).slice(-2)}`;
}

function formatMonthDay(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatMonthDayYear(date: Date): string {
  return `${formatMonthDay(date)}, ${date.getFullYear()}`;
}

function formatSocialDateStamp(
  timestampMs: number,
  referenceMs: number
): SocialCalendarTime | null {
  const date = new Date(timestampMs);
  if (!Number.isFinite(date.getTime())) return null;

  const monthDay = formatMonthDay(date);
  const year = date.getFullYear();
  const title = formatMonthDayYear(date);
  const referenceYear = new Date(referenceMs).getFullYear();

  if (year === referenceYear) {
    return { label: monthDay, title };
  }

  return {
    label: `${monthDay} ${formatShortYear(year)}`,
    title,
  };
}

export interface SocialCalendarTime {
  /** Compact row label — e.g. Mar 12 or Mar 12 '24. */
  label: string;
  /** Full calendar phrase for tooltips and screen readers. */
  title: string;
}

/**
 * Visible stamp: `now`, `5m`, `3h`, `4d`, then `Mar 12` or `Mar 12 '24`.
 * `title` keeps the phrase (`5m ago`, `Mar 12, 2026`) for sentences and hover.
 */
export function formatSocialRelativeTime(
  timestampMs: number | null | undefined,
  referenceMs = Date.now()
): string {
  const calendar = formatSocialCalendarTime(timestampMs, referenceMs);
  return calendar?.label ?? '';
}

export function formatSocialCalendarTime(
  timestampMs: number | null | undefined,
  referenceMs = Date.now()
): SocialCalendarTime | null {
  if (!timestampMs || !Number.isFinite(timestampMs)) return null;

  const diff = Math.max(0, referenceMs - timestampMs);
  const min = Math.floor(diff / 60000);
  if (min < 1) {
    return { label: 'now', title: 'just now' };
  }
  if (min < 60) {
    return { label: `${min}m`, title: `${min}m ago` };
  }
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    return { label: `${hr}h`, title: `${hr}h ago` };
  }
  const day = Math.floor(hr / 24);
  if (day < 7) {
    return { label: `${day}d`, title: `${day}d ago` };
  }

  return formatSocialDateStamp(timestampMs, referenceMs);
}

/**
 * Future stamp: `soon`, `5m`, `3h`, `4d` under a week, then `Mar 12`.
 * Callers that want `in 5m` add the preposition for the short buckets.
 */
export function formatSocialFutureStamp(
  timestampMs: number | null | undefined,
  referenceMs = Date.now()
): string {
  if (!timestampMs || !Number.isFinite(timestampMs) || timestampMs <= 0) {
    return '';
  }
  const delta = timestampMs - referenceMs;
  if (delta <= 0) return 'soon';
  const minutes = Math.max(1, Math.ceil(delta / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return formatSocialDateStamp(timestampMs, referenceMs)?.label ?? '';
}

export function formatSocialStandingTimeMeta(
  account: {
    standingSince?: number | null;
    standingBlockTimestamp?: number | null;
  },
  referenceMs = Date.now()
): { label: string; description: string } | null {
  const since = normalizeSocialTimestamp(account.standingSince);
  if (since) {
    const calendar = formatSocialCalendarTime(since, referenceMs);
    if (!calendar) return null;
    return {
      label: calendar.label,
      description: `Standing since ${calendar.title}`,
    };
  }

  const added = normalizeSocialTimestamp(account.standingBlockTimestamp);
  if (!added) return null;

  const calendar = formatSocialCalendarTime(added, referenceMs);
  if (!calendar) return null;
  return {
    label: calendar.label,
    description: `Standing added ${calendar.title}`,
  };
}
