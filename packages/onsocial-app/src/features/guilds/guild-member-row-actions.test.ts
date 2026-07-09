import { describe, expect, it } from 'vitest';
import type { GroupMemberRow } from '@onsocial/sdk';
import {
  canViewerManageGuildMembers,
  guildMemberActionConfirmCopy,
  guildMemberRowActions,
} from '@/features/guilds/guild-member-row-actions';

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

const ownerViewer = {
  viewerAccountId: 'owner.testnet',
  viewerIsOwner: true,
  viewerIsAdmin: true,
  memberDriven: false,
};

describe('guild member row actions', () => {
  it('hides menu for non-managers and self', () => {
    expect(
      guildMemberRowActions(member({ memberId: 'bob.testnet' }), {
        ...ownerViewer,
        viewerIsOwner: false,
        viewerIsAdmin: false,
      })
    ).toEqual([]);
    expect(
      guildMemberRowActions(member({ memberId: 'owner.testnet' }), ownerViewer)
    ).toEqual([]);
  });

  it('offers promote/remove actions for a regular member', () => {
    const actions = guildMemberRowActions(
      member({ memberId: 'writer.testnet' }),
      ownerViewer
    );
    expect(actions.map((action) => action.id)).toEqual([
      'transfer-ownership',
      'make-mod',
      'make-admin',
      'remove-from-guild',
      'copy-handle',
    ]);
  });

  it('offers transfer ownership on admin rows for the guild owner', () => {
    const actions = guildMemberRowActions(
      member({ memberId: 'admin.testnet', isAdmin: true }),
      ownerViewer
    );
    expect(actions.map((action) => action.id)).toEqual([
      'transfer-ownership',
      'demote-to-mod',
      'remove-admin',
      'remove-from-guild',
      'copy-handle',
    ]);
  });

  it('shows copy handle on the owner own row', () => {
    expect(
      guildMemberRowActions(
        member({ memberId: 'owner.testnet', isOwner: true }),
        { ...ownerViewer, viewerAccountId: 'owner.testnet' }
      )
    ).toEqual([{ id: 'copy-handle', label: 'Copy @handle' }]);
  });

  it('offers demote and remove actions for admins when viewer is owner', () => {
    const actions = guildMemberRowActions(
      member({ memberId: 'admin.testnet', isAdmin: true }),
      ownerViewer
    );
    expect(actions.map((action) => action.id)).toContain('demote-to-mod');
  });

  it('limits admin management to the owner', () => {
    const adminViewer = {
      viewerAccountId: 'admin.testnet',
      viewerIsOwner: false,
      viewerIsAdmin: true,
      memberDriven: false,
    };
    expect(
      guildMemberRowActions(
        member({ memberId: 'other-admin.testnet', isAdmin: true }),
        adminViewer
      )
    ).toEqual([]);
    expect(
      guildMemberRowActions(
        member({ memberId: 'mod.testnet', canModerate: true }),
        adminViewer
      ).map((action) => action.id)
    ).toContain('remove-mod');
  });

  it('prefixes proposal labels in member-driven guilds', () => {
    const actions = guildMemberRowActions(
      member({ memberId: 'writer.testnet' }),
      { ...ownerViewer, memberDriven: true }
    );
    expect(actions[0]?.label).toBe('Propose: Transfer ownership');
    expect(canViewerManageGuildMembers(ownerViewer)).toBe(true);
  });

  it('builds confirm copy for direct and proposal actions', () => {
    expect(
      guildMemberActionConfirmCopy({
        id: 'make-mod',
        label: 'Add to mod team',
      })
    ).toEqual({
      title: 'Add to mod team',
      subtitle: 'They can moderate posts and help manage members.',
      confirmLabel: 'Add to mod team',
    });

    expect(
      guildMemberActionConfirmCopy({
        id: 'transfer-ownership',
        label: 'Transfer ownership',
        destructive: true,
      })
    ).toEqual({
      title: 'Transfer ownership',
      subtitle:
        'They become guild owner. Choose whether you stay as a member or leave the guild.',
      confirmLabel: 'Transfer ownership',
    });

    expect(
      guildMemberActionConfirmCopy({
        id: 'remove-from-guild',
        label: 'Propose removal',
        destructive: true,
        propose: true,
      })
    ).toEqual({
      title: 'Remove from guild',
      subtitle:
        'Members must vote before this role takes effect. They will lose access to this guild.',
      confirmLabel: 'Submit proposal',
    });
  });
});
