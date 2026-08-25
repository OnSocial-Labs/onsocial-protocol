import { describe, expect, it } from 'vitest';
import {
  buildDmThreadRows,
  formatDmReplyPreview,
} from './dm-thread-rows';

describe('buildDmThreadRows', () => {
  const now = new Date(2026, 7, 25, 15, 0, 0);

  it('inserts a day rule when the local day changes', () => {
    const rows = buildDmThreadRows(
      [
        {
          id: 'a',
          createdAt: new Date(2026, 7, 24, 22, 0, 0).toISOString(),
        },
        {
          id: 'b',
          createdAt: new Date(2026, 7, 25, 8, 0, 0).toISOString(),
        },
      ],
      now
    );
    expect(rows.map((row) => row.kind)).toEqual([
      'day',
      'message',
      'day',
      'message',
    ]);
    const days = rows.filter((row) => row.kind === 'day');
    expect(days[0]?.label).toBe('Yesterday');
    expect(days[1]?.label).toBe('Today');
  });
});

describe('formatDmReplyPreview', () => {
  it('falls back to media or Message', () => {
    expect(formatDmReplyPreview('', true)).toBe('Photo or video');
    expect(formatDmReplyPreview('')).toBe('Message');
    expect(formatDmReplyPreview('  later  today  ')).toBe('later today');
  });
});
