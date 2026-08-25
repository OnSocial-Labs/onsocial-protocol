import {
  dmLocalDayKey,
  formatDmDaySeparator,
} from '@/features/messages/dm-time';

export type DmThreadDayRow = {
  kind: 'day';
  key: string;
  label: string;
};

export type DmThreadMessageRow<T> = {
  kind: 'message';
  message: T;
};

export type DmThreadRow<T> = DmThreadDayRow | DmThreadMessageRow<T>;

/** Insert a day rule whenever the local calendar day changes. */
export function buildDmThreadRows<T extends { id: string; createdAt: string }>(
  messages: readonly T[],
  now: Date = new Date()
): DmThreadRow<T>[] {
  const rows: DmThreadRow<T>[] = [];
  let lastDay: string | null = null;
  for (const message of messages) {
    const day = dmLocalDayKey(message.createdAt);
    if (day && day !== lastDay) {
      const label = formatDmDaySeparator(message.createdAt, now);
      if (label) {
        rows.push({ kind: 'day', key: `day:${day}`, label });
        lastDay = day;
      }
    }
    rows.push({ kind: 'message', message });
  }
  return rows;
}

export function formatDmReplyPreview(
  text: string | null | undefined,
  hasMedia = false
): string {
  const collapsed = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!collapsed) return hasMedia ? 'Photo or video' : 'Message';
  if (collapsed.length <= 72) return collapsed;
  return `${collapsed.slice(0, 71).trimEnd()}…`;
}
