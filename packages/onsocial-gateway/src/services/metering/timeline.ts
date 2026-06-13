/** Time-bucketed usage for developer dashboards (burst / spike visibility). */

export interface UsageTimelinePoint {
  /** ISO-8601 start of bucket (UTC). */
  t: string;
  count: number;
  rateLimited: number;
}

export interface UsageTimeline {
  window: string;
  bucketSec: number;
  points: UsageTimelinePoint[];
}

export interface UsageTimelineParams {
  windowSec: number;
  bucketSec: number;
}

export const DEFAULT_TIMELINE: UsageTimelineParams = {
  windowSec: 60 * 60,
  bucketSec: 60,
};

const MIN_WINDOW_SEC = 60;
const MAX_WINDOW_SEC = 24 * 60 * 60;
const MIN_BUCKET_SEC = 60;
const MAX_BUCKET_SEC = 60 * 60;
const MAX_POINTS = 120;

export type TimelineQueryInput = {
  window?: string;
  bucket?: string;
};

export type TimelineQueryResult =
  | UsageTimelineParams
  | { error: string; code: 'INVALID_TIMELINE' };

function parseDuration(value: string, unit: string): number | null {
  const amount = Number.parseInt(value, 10);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  switch (unit) {
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 60 * 60;
    default:
      return null;
  }
}

export function parseTimelineQuery(
  query: TimelineQueryInput
): TimelineQueryResult {
  const windowRaw = query.window?.trim() ?? '60m';
  const bucketRaw = query.bucket?.trim() ?? '1m';

  const windowMatch = /^(\d+)(m|h)$/.exec(windowRaw);
  const bucketMatch = /^(\d+)(m|h)$/.exec(bucketRaw);
  if (!windowMatch || !bucketMatch) {
    return {
      error: 'window and bucket must use formats like 60m or 24h / 1m or 15m',
      code: 'INVALID_TIMELINE',
    };
  }

  const windowSec = parseDuration(windowMatch[1], windowMatch[2]);
  const bucketSec = parseDuration(bucketMatch[1], bucketMatch[2]);
  if (windowSec == null || bucketSec == null) {
    return {
      error: 'window and bucket must use positive integer durations',
      code: 'INVALID_TIMELINE',
    };
  }

  if (
    windowSec < MIN_WINDOW_SEC ||
    windowSec > MAX_WINDOW_SEC ||
    bucketSec < MIN_BUCKET_SEC ||
    bucketSec > MAX_BUCKET_SEC
  ) {
    return {
      error: `window must be ${MIN_WINDOW_SEC}s–${MAX_WINDOW_SEC}s and bucket ${MIN_BUCKET_SEC}s–${MAX_BUCKET_SEC}s`,
      code: 'INVALID_TIMELINE',
    };
  }

  if (windowSec % bucketSec !== 0) {
    return {
      error: 'window must be evenly divisible by bucket size',
      code: 'INVALID_TIMELINE',
    };
  }

  const pointCount = windowSec / bucketSec;
  if (pointCount > MAX_POINTS) {
    return {
      error: `timeline exceeds ${MAX_POINTS} buckets — use a larger bucket size`,
      code: 'INVALID_TIMELINE',
    };
  }

  return { windowSec, bucketSec };
}

export function formatTimelineWindow(windowSec: number): string {
  if (windowSec % 3600 === 0) return `${windowSec / 3600}h`;
  return `${windowSec / 60}m`;
}

export function floorToBucket(date: Date, bucketSec: number): number {
  const ms = bucketSec * 1000;
  return Math.floor(date.getTime() / ms) * ms;
}

export function buildEmptyTimelinePoints(
  now: Date,
  params: UsageTimelineParams
): UsageTimelinePoint[] {
  const endBucketMs = floorToBucket(now, params.bucketSec);
  const startMs = endBucketMs - (params.windowSec - params.bucketSec) * 1000;
  const points: UsageTimelinePoint[] = [];

  for (
    let bucketMs = startMs;
    bucketMs <= endBucketMs;
    bucketMs += params.bucketSec * 1000
  ) {
    points.push({
      t: new Date(bucketMs).toISOString(),
      count: 0,
      rateLimited: 0,
    });
  }

  return points;
}

export interface TimelineEntry {
  createdAt: Date;
  statusCode: number;
}

export function bucketTimelineEntries(
  entries: TimelineEntry[],
  now: Date,
  params: UsageTimelineParams
): UsageTimelinePoint[] {
  const points = buildEmptyTimelinePoints(now, params);
  if (points.length === 0) return points;

  const indexByMs = new Map<number, number>();
  points.forEach((point, index) => {
    indexByMs.set(new Date(point.t).getTime(), index);
  });

  const startMs = new Date(points[0].t).getTime();
  const endMs = new Date(points[points.length - 1].t).getTime();

  for (const entry of entries) {
    const bucketMs = floorToBucket(entry.createdAt, params.bucketSec);
    if (bucketMs < startMs || bucketMs > endMs) continue;

    const index = indexByMs.get(bucketMs);
    if (index == null) continue;

    points[index].count += 1;
    if (entry.statusCode === 429) {
      points[index].rateLimited += 1;
    }
  }

  return points;
}

export function applyTimelineRows(
  points: UsageTimelinePoint[],
  rows: Array<{ bucketMs: number; count: number; rateLimited: number }>
): UsageTimelinePoint[] {
  const indexByMs = new Map(
    points.map((point, index) => [new Date(point.t).getTime(), index])
  );

  for (const row of rows) {
    const index = indexByMs.get(row.bucketMs);
    if (index == null) continue;
    points[index].count = row.count;
    points[index].rateLimited = row.rateLimited;
  }

  return points;
}

export function buildUsageTimelineFromRows(
  rows: Array<{ bucketMs: number; count: number; rateLimited: number }>,
  now: Date,
  params: UsageTimelineParams = DEFAULT_TIMELINE
): UsageTimeline {
  const points = buildEmptyTimelinePoints(now, params);
  applyTimelineRows(points, rows);
  return {
    window: formatTimelineWindow(params.windowSec),
    bucketSec: params.bucketSec,
    points,
  };
}

export function buildUsageTimeline(
  entries: TimelineEntry[],
  now: Date,
  params: UsageTimelineParams = DEFAULT_TIMELINE
): UsageTimeline {
  return {
    window: formatTimelineWindow(params.windowSec),
    bucketSec: params.bucketSec,
    points: bucketTimelineEntries(entries, now, params),
  };
}
