import { describe, expect, it } from 'vitest';
import {
  bucketTimelineEntries,
  buildEmptyTimelinePoints,
  buildUsageTimeline,
  parseTimelineQuery,
} from '../../src/services/metering/timeline.js';

describe('parseTimelineQuery', () => {
  it('defaults to 60m window and 1m buckets', () => {
    expect(parseTimelineQuery({})).toEqual({
      windowSec: 3600,
      bucketSec: 60,
    });
  });

  it('accepts custom window and bucket', () => {
    expect(parseTimelineQuery({ window: '24h', bucket: '15m' })).toEqual({
      windowSec: 86400,
      bucketSec: 900,
    });
  });

  it('rejects invalid formats', () => {
    const result = parseTimelineQuery({ window: '60s', bucket: '1m' });
    expect(result).toMatchObject({ code: 'INVALID_TIMELINE' });
  });

  it('rejects too many buckets', () => {
    const result = parseTimelineQuery({ window: '24h', bucket: '1m' });
    expect(result).toMatchObject({ code: 'INVALID_TIMELINE' });
  });
});

describe('bucketTimelineEntries', () => {
  const params = { windowSec: 300, bucketSec: 60 };
  const now = new Date('2026-06-13T12:05:30.000Z');

  it('returns empty buckets when there is no traffic', () => {
    const points = buildEmptyTimelinePoints(now, params);
    expect(points).toHaveLength(5);
    expect(points.every((point) => point.count === 0)).toBe(true);
  });

  it('aggregates counts and 429s per minute bucket', () => {
    const timeline = buildUsageTimeline(
      [
        {
          createdAt: new Date('2026-06-13T12:03:10.000Z'),
          statusCode: 200,
        },
        {
          createdAt: new Date('2026-06-13T12:03:45.000Z'),
          statusCode: 429,
        },
        {
          createdAt: new Date('2026-06-13T12:03:59.000Z'),
          statusCode: 429,
        },
        {
          createdAt: new Date('2026-06-13T12:04:01.000Z'),
          statusCode: 200,
        },
      ],
      now,
      params
    );

    const busy = timeline.points.find(
      (point) => point.t === '2026-06-13T12:03:00.000Z'
    );
    const quiet = timeline.points.find(
      (point) => point.t === '2026-06-13T12:04:00.000Z'
    );

    expect(busy).toEqual({
      t: '2026-06-13T12:03:00.000Z',
      count: 3,
      rateLimited: 2,
    });
    expect(quiet).toEqual({
      t: '2026-06-13T12:04:00.000Z',
      count: 1,
      rateLimited: 0,
    });
  });

  it('ignores entries outside the window', () => {
    const points = bucketTimelineEntries(
      [
        {
          createdAt: new Date('2026-06-13T11:50:00.000Z'),
          statusCode: 200,
        },
      ],
      now,
      params
    );

    expect(points.every((point) => point.count === 0)).toBe(true);
  });
});
