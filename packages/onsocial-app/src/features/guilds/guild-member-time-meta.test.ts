import { describe, expect, it, vi } from 'vitest';
import { guildMemberTimeMeta } from '@/features/guilds/guild-member-time-meta';

describe('guildMemberTimeMeta', () => {
  it('formats join time with standing-style relative labels', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T12:00:00Z'));

    const twoHoursAgo = Date.parse('2026-07-07T10:00:00Z');
    expect(guildMemberTimeMeta(twoHoursAgo)).toEqual({
      label: '2h ago',
      prefix: 'Joined',
      description: 'Joined 2h ago',
    });

    expect(guildMemberTimeMeta(twoHoursAgo, { isOwner: true })).toEqual({
      label: '2h ago',
      prefix: 'Member since',
      description: 'Member since 2h ago',
    });

    vi.useRealTimers();
  });
});
