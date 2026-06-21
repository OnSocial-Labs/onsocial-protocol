export interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
}

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

export function minutesToParts(totalMinutes: number): DurationParts {
  const safe = Math.max(
    0,
    Math.floor(Number.isFinite(totalMinutes) ? totalMinutes : 0)
  );
  const days = Math.floor(safe / MINUTES_PER_DAY);
  const hours = Math.floor((safe % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  const minutes = safe % MINUTES_PER_HOUR;
  return { days, hours, minutes };
}

export function partsToMinutes(parts: DurationParts): number {
  return (
    Math.max(0, parts.days) * MINUTES_PER_DAY +
    Math.max(0, Math.min(23, parts.hours)) * MINUTES_PER_HOUR +
    Math.max(0, Math.min(59, parts.minutes))
  );
}

export function formatDurationPartsCompact(parts: DurationParts): string {
  const segments: string[] = [];
  if (parts.days > 0) {
    segments.push(`${parts.days}d`);
  }
  if (parts.hours > 0) {
    segments.push(`${parts.hours}h`);
  }
  if (parts.minutes > 0 || segments.length === 0) {
    segments.push(`${parts.minutes}m`);
  }
  return segments.join(' ');
}

export function readTimestampNs(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function formatCountdownToTimestampNs(
  targetNs: number,
  nowMs = Date.now(),
  options?: { compact?: boolean }
): string {
  const targetMs = targetNs / 1_000_000;
  const remainingMs = targetMs - nowMs;

  if (remainingMs <= 0) {
    return options?.compact ? '0s' : '0m';
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (options?.compact) {
    if (days > 0) {
      return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m`;
    }
    return `${seconds}s`;
  }

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/** Poll interval for a live countdown label (ms). */
export function resolveCountdownTickMs(
  targetNs: number,
  nowMs = Date.now(),
  compact = false
): number {
  if (!compact) {
    return 1_000;
  }

  const remainingMs = targetNs / 1_000_000 - nowMs;
  if (remainingMs >= 3_600_000) {
    return 60_000;
  }
  if (remainingMs >= 60_000) {
    return 10_000;
  }
  return 1_000;
}

export function formatLocalDateTimeFromMs(ms: number): string {
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function resolveStartOffsetMinutes(
  startsAtLocal: string,
  nowMs = Date.now()
): number {
  const startsMs = Date.parse(startsAtLocal);
  if (!Number.isFinite(startsMs)) {
    return 0;
  }
  return Math.max(0, Math.round((startsMs - nowMs) / 60_000));
}

export function startsAtLocalFromOffsetMinutes(
  offsetMinutes: number,
  nowMs = Date.now()
): string {
  const ms = nowMs + Math.max(0, offsetMinutes) * 60_000;
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
