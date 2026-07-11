import { describe, expect, it } from 'vitest';
import { PERMISSION } from '@onsocial/sdk';
import type { GroupMemberRow } from '@onsocial/sdk';
import {
  applyGuildMemberActionToRow,
  allowlistWriterCandidates,
  guildMemberRolesFromPermissionLevel,
  patchGuildMemberRosterAction,
  readGuildOwnerId,
  reconcileGuildMemberRolesFromChain,
  reconcileGuildMemberRoster,
} from '@/features/guilds/guild-member-roster';
import {
  countGuildMembersByRoleFilter,
  guildMemberRoleBucket,
} from '@/features/guilds/guild-member-filter';

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

describe('guild member roster reconciliation', () => {
  it('reads owner id from chain config', () => {
    expect(readGuildOwnerId({ owner: 'owner.testnet' })).toBe('owner.testnet');
    expect(readGuildOwnerId({ owner: '  ' })).toBeNull();
    expect(readGuildOwnerId(null)).toBeNull();
  });

  it('marks chain owner and clears stale owner flags', () => {
    const roster = [
      member({
        memberId: 'owner.testnet',
        isAdmin: true,
        canModerate: true,
      }),
      member({
        memberId: 'stale.testnet',
        isOwner: true,
        isAdmin: true,
        canModerate: true,
      }),
    ];

    const reconciled = reconcileGuildMemberRoster(roster, 'owner.testnet');

    expect(guildMemberRoleBucket(reconciled[0]!)).toBe('owner');
    expect(guildMemberRoleBucket(reconciled[1]!)).toBe('admin');
    expect(countGuildMembersByRoleFilter(reconciled, 'owner')).toBe(1);
  });

  it('excludes owner and admins from allowlist writer candidates', () => {
    const roster = reconcileGuildMemberRoster(
      [
        member({ memberId: 'owner.testnet' }),
        member({ memberId: 'admin.testnet', isAdmin: true }),
        member({ memberId: 'mod.testnet', canModerate: true }),
        member({ memberId: 'writer.testnet' }),
      ],
      'owner.testnet'
    );

    expect(
      allowlistWriterCandidates(roster, 'owner.testnet').map((row) => row.memberId)
    ).toEqual(['mod.testnet', 'writer.testnet']);
  });

  it('reconciles mod/admin flags from chain role views without downgrading', () => {
    const roster = [
      member({ memberId: 'writer.testnet', canModerate: true }),
      member({ memberId: 'mod.testnet' }),
    ];
    const roleFlags = new Map([
      ['writer.testnet', { isAdmin: false, canModerate: false }],
      ['mod.testnet', { isAdmin: false, canModerate: true }],
    ]);

    const reconciled = reconcileGuildMemberRolesFromChain(
      roster,
      'owner.testnet',
      roleFlags
    );

    expect(guildMemberRoleBucket(reconciled[0]!)).toBe('moderator');
    expect(guildMemberRoleBucket(reconciled[1]!)).toBe('moderator');
  });

  it('maps permission levels to roster role flags', () => {
    expect(guildMemberRolesFromPermissionLevel(PERMISSION.MODERATE)).toEqual({
      level: PERMISSION.MODERATE,
      isAdmin: false,
      canModerate: true,
    });
    expect(guildMemberRolesFromPermissionLevel(PERMISSION.MANAGE)).toEqual({
      level: PERMISSION.MANAGE,
      isAdmin: true,
      canModerate: true,
    });
  });

  it('patches roster rows after direct role actions', () => {
    const roster = [member({ memberId: 'writer.testnet' })];
    const patched = patchGuildMemberRosterAction(
      roster,
      'writer.testnet',
      'make-mod'
    );

    expect(guildMemberRoleBucket(patched[0]!)).toBe('moderator');
    expect(
      applyGuildMemberActionToRow(patched[0]!, 'remove-from-guild')
    ).toBeNull();
  });
});
