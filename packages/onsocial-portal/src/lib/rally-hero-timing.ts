import type { SeasonZeroLifecyclePhase } from '@/features/season/season-zero-types';

export type RallyHeroTimingMeta = {
  /** Compact label for the hero row. */
  label: string;
  /** Full phrase for tooltips and screen readers. */
  title: string;
};

const EN_DASH = '–';

function formatShortYear(year: number): string {
  return `'${String(year).slice(-2)}`;
}

function formatMonthDay(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatMonthDayYear(date: Date, year: number): string {
  return `${formatMonthDay(date)}, ${year}`;
}

function formatHeroCalendarDate(
  timestampNs: number,
  referenceMs: number,
  options: { forceYear?: boolean; shortYear?: boolean } = {}
): { label: string; title: string } {
  const date = new Date(timestampNs / 1_000_000);
  const referenceYear = new Date(referenceMs).getFullYear();
  const year = date.getFullYear();
  const includeYear = options.forceYear || year !== referenceYear;
  const monthDay = formatMonthDay(date);

  if (!includeYear) {
    return { label: monthDay, title: monthDay };
  }

  if (options.shortYear) {
    return {
      label: `${monthDay} ${formatShortYear(year)}`,
      title: formatMonthDayYear(date, year),
    };
  }

  const long = formatMonthDayYear(date, year);
  return { label: long, title: long };
}

/** Compact run window for archived seasons — e.g. Jun 16–17 '26. */
export function formatSeasonRunWindow(
  startsAtNs: number,
  endsAtNs: number,
  referenceMs = Date.now()
): RallyHeroTimingMeta | null {
  if (startsAtNs <= 0 && endsAtNs <= 0) {
    return null;
  }

  if (startsAtNs <= 0) {
    const ended = formatHeroCalendarDate(endsAtNs, referenceMs, {
      forceYear: true,
      shortYear: true,
    });
    return {
      label: `Ended ${ended.label}`,
      title: `Season ended ${ended.title}`,
    };
  }

  if (endsAtNs <= 0) {
    const start = formatHeroCalendarDate(startsAtNs, referenceMs, {
      forceYear: true,
      shortYear: true,
    });
    return {
      label: start.label,
      title: `Season started ${start.title}`,
    };
  }

  const start = new Date(startsAtNs / 1_000_000);
  const end = new Date(endsAtNs / 1_000_000);
  const year = start.getFullYear();
  const shortYear = formatShortYear(year);
  const longYear = String(year);

  const sameMonth =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    const startLabel = formatMonthDay(start);
    const endDay = end.toLocaleDateString('en-US', { day: 'numeric' });
    return {
      label: `${startLabel}${EN_DASH}${endDay} ${shortYear}`,
      title: `${startLabel} ${EN_DASH} ${endDay}, ${longYear}`,
    };
  }

  const startLabel = formatMonthDay(start);
  const endLabel = formatMonthDay(end);

  if (sameYear) {
    return {
      label: `${startLabel}${EN_DASH}${endLabel} ${shortYear}`,
      title: `${startLabel} ${EN_DASH} ${endLabel}, ${longYear}`,
    };
  }

  const startFull = formatMonthDayYear(start, start.getFullYear());
  const endFull = formatMonthDayYear(end, end.getFullYear());
  return {
    label: `${startLabel}${EN_DASH}${endLabel}`,
    title: `${startFull} ${EN_DASH} ${endFull}`,
  };
}

/** Static calendar context for the rally hero header (pulse owns countdowns). */
export function resolveRallyHeroTimingMeta({
  phase,
  startsAtNs,
  endsAtNs,
  nowMs = Date.now(),
}: {
  phase: SeasonZeroLifecyclePhase | null | undefined;
  startsAtNs: number;
  endsAtNs: number;
  nowMs?: number;
}): RallyHeroTimingMeta | null {
  if (!phase) {
    return null;
  }

  if (phase === 'upcoming') {
    if (startsAtNs <= 0) return null;
    const opens = formatHeroCalendarDate(startsAtNs, nowMs);
    return {
      label: `Opens ${opens.label}`,
      title: `Opens ${opens.title}`,
    };
  }

  if (phase === 'live') {
    if (endsAtNs <= 0) return null;
    const ends = formatHeroCalendarDate(endsAtNs, nowMs);
    return {
      label: `Ends ${ends.label}`,
      title: `Ends ${ends.title}`,
    };
  }

  return formatSeasonRunWindow(startsAtNs, endsAtNs, nowMs);
}
