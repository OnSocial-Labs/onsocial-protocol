import { describe, expect, it } from 'vitest';
import { buildNotificationDayRows } from '@/lib/notification-day-rows';

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
    expect(rows.map((row) => row.kind)).toEqual([
      'day',
      'item',
      'day',
      'item',
    ]);
    const days = rows.filter((row) => row.kind === 'day');
    expect(days[0]?.label).toBe('Today');
    expect(days[1]?.label).toBe('Yesterday');
  });
});
