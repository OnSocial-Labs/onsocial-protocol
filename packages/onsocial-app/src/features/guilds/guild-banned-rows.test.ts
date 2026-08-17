import { describe, expect, it } from 'vitest';
import { bannedRowsAsMemberRows } from '@/features/guilds/guild-banned-rows';

describe('bannedRowsAsMemberRows', () => {
  it('adapts banned indexer rows into member-list shape', () => {
    expect(
      bannedRowsAsMemberRows(
        [
          {
            groupId: 'grp_test',
            memberId: 'mallory.testnet',
            blockHeight: 12,
            blockTimestamp: 99,
          },
        ],
        'grp_test'
      )
    ).toEqual([
      {
        groupId: 'grp_test',
        memberId: 'mallory.testnet',
        role: null,
        level: 0,
        isOwner: false,
        isAdmin: false,
        canModerate: false,
        blockHeight: 12,
        blockTimestamp: 99,
      },
    ]);
  });
});
