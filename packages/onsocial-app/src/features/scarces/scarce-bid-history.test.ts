import { describe, expect, it } from 'vitest';
import { bidHistoryClock } from '@/features/scarces/scarce-bid-form';

describe('bidHistoryClock', () => {
  const now = Date.parse('2026-06-15T12:00:00.000Z');

  it('stamps a bid without naming the bid', () => {
    expect(bidHistoryClock((now - 5 * 60_000) * 1_000_000, now)?.label).toBe(
      '5m'
    );
    expect(bidHistoryClock(0, now)).toBeNull();
  });
});
