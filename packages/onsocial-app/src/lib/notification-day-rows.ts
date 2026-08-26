import {
  dmLocalDayKey,
  formatDmDaySeparator,
} from '@/features/messages/dm-time';

export type NotificationDayRow = {
  kind: 'day';
  key: string;
  label: string;
};

export type NotificationItemRow<T> = {
  kind: 'item';
  item: T;
};

export type NotificationListRow<T> = NotificationDayRow | NotificationItemRow<T>;

/** Insert a day rule whenever the local calendar day changes. */
export function buildNotificationDayRows<
  T extends { id: string; createdAt: string },
>(items: readonly T[], now: Date = new Date()): NotificationListRow<T>[] {
  const rows: NotificationListRow<T>[] = [];
  let lastDay: string | null = null;
  for (const item of items) {
    const day = dmLocalDayKey(item.createdAt);
    if (day && day !== lastDay) {
      const label = formatDmDaySeparator(item.createdAt, now);
      if (label) {
        rows.push({ kind: 'day', key: `day:${day}`, label });
        lastDay = day;
      }
    }
    rows.push({ kind: 'item', item });
  }
  return rows;
}
