import { describe, expect, it } from 'vitest';
import {
  buildNotificationDayRows,
  notificationRowKey,
} from '@/lib/notification-day-rows';

describe('buildNotificationDayRows', () => {
  const now = new Date(2026, 7, 25, 15, 0, 0);

  it('inserts Today / Yesterday when the local day changes', () => {
    const rows = buildNotificationDayRows(
      [
        {
          id: 'a',
          createdAt: new Date(2026, 7, 25, 8, 0, 0).toISOString(),
        },
        {
          id: 'b',
          createdAt: new Date(2026, 7, 24, 22, 0, 0).toISOString(),
        },
      ],
      now
    );
    expect(rows.map((row) => row.kind)).toEqual(['day', 'item', 'day', 'item']);
    const days = rows.filter((row) => row.kind === 'day');
    expect(days[0]?.label).toBe('Today');
    expect(days[1]?.label).toBe('Yesterday');
  });
});

describe('notificationRowKey', () => {
  it('keys day rules on the day and items on their id', () => {
    const rows = buildNotificationDayRows(
      [
        {
          id: 'n-1',
          createdAt: new Date(2026, 7, 25, 8, 0, 0).toISOString(),
        },
        {
          id: 'n-2',
          createdAt: new Date(2026, 7, 24, 22, 0, 0).toISOString(),
        },
      ],
      new Date(2026, 7, 25, 15, 0, 0)
    );
    const keys = rows.map(notificationRowKey);
    expect(keys[1]).toBe('n-1');
    expect(keys[3]).toBe('n-2');
    expect(keys[0]).toMatch(/^day:/);
    expect(keys[2]).toMatch(/^day:/);
    expect(new Set(keys).size).toBe(rows.length);
  });
});
