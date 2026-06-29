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

export interface SocialCalendarTime {
  /** Compact row label — e.g. Mar 12 or Mar 12 '24. */
  label: string;
  /** Full calendar phrase for tooltips and screen readers. */
  title: string;
}

/** Relative buckets, then compact calendar date with short year when not current year. */
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
    return { label: 'just now', title: 'just now' };
  }
  if (min < 60) {
    const label = `${min}m ago`;
    return { label, title: label };
  }
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    const label = `${hr}h ago`;
    return { label, title: label };
  }
  const day = Math.floor(hr / 24);
  if (day < 7) {
    const label = `${day}d ago`;
    return { label, title: label };
  }

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
