import { describe, expect, it } from 'vitest';
import {
  countGuildMembersByRoleFilter,
  filterGuildMembers,
  guildMemberRoleBucket,
} from '@/features/guilds/guild-member-filter';
import type { GroupMemberRow } from '@onsocial/sdk';

function member(
  overrides: Partial<GroupMemberRow> & Pick<GroupMemberRow, 'memberId'>
): GroupMemberRow {
  return {
    groupId: 'grp_test',
    role: null,
    level: 0,
    isOwner: false,
    isAdmin: false,
    canModerate: false,
    blockHeight: 1,
    blockTimestamp: 1,
    ...overrides,
  };
}

describe('guild member filters', () => {
  const roster = [
    member({ memberId: 'owner.testnet', isOwner: true, isAdmin: true, canModerate: true }),
    member({ memberId: 'admin.testnet', isAdmin: true, canModerate: true }),
    member({ memberId: 'mod.testnet', canModerate: true }),
    member({ memberId: 'writer.testnet' }),
  ];

  it('assigns mutually exclusive role buckets', () => {
    expect(guildMemberRoleBucket(roster[0]!)).toBe('owner');
    expect(guildMemberRoleBucket(roster[1]!)).toBe('admin');
    expect(guildMemberRoleBucket(roster[2]!)).toBe('moderator');
    expect(guildMemberRoleBucket(roster[3]!)).toBe('member');
  });

  it('counts and filters by role', () => {
    expect(countGuildMembersByRoleFilter(roster, 'all')).toBe(4);
    expect(countGuildMembersByRoleFilter(roster, 'owner')).toBe(1);
    expect(countGuildMembersByRoleFilter(roster, 'admin')).toBe(1);
    expect(countGuildMembersByRoleFilter(roster, 'member')).toBe(1);
    expect(
      filterGuildMembers(roster, {}, { roleFilter: 'owner', query: '' }).map(
        (row) => row.memberId
      )
    ).toEqual(['owner.testnet']);
    expect(
      filterGuildMembers(roster, {}, { roleFilter: 'moderator', query: '' }).map(
        (row) => row.memberId
      )
    ).toEqual(['mod.testnet']);
    expect(
      filterGuildMembers(roster, {}, { roleFilter: 'member', query: '' }).map(
        (row) => row.memberId
      )
    ).toEqual(['writer.testnet']);
  });
});
