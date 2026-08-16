import { describe, expect, it } from 'vitest';
import { notificationListLimitForTier } from '../../src/services/notifications/index.js';

describe('notificationListLimitForTier', () => {
  it('keeps free-tier inbox pages aligned with the Activity PAGE_SIZE', () => {
    expect(notificationListLimitForTier('free')).toBe(40);
  });

  it('raises caps for paid developer tiers', () => {
    expect(notificationListLimitForTier('pro')).toBe(50);
    expect(notificationListLimitForTier('scale')).toBe(200);
    expect(notificationListLimitForTier('service')).toBe(500);
  });
});
