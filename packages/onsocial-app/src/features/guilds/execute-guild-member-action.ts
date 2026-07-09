import type { NearWalletBase } from '@hot-labs/near-connect';
import type { OnSocial } from '@onsocial/sdk';
import { PERMISSION } from '@onsocial/sdk';
import { guildGroupConfigPath } from '@/features/guilds/guild-group-config-path';
import type { GuildMemberRowActionId } from '@/features/guilds/guild-member-row-actions';
import { createAppOnSocialClient } from '@/lib/create-app-onsocial-client';

/** Owner-led permission grants hit `execute_admin` and need wallet broadcast. */
function walletPermissionsClient(
  accountId: string,
  wallet: NearWalletBase
): OnSocial {
  return createAppOnSocialClient(accountId, wallet);
}

export async function executeGuildMemberAction(
  client: OnSocial,
  input: {
    accountId: string;
    wallet: NearWalletBase;
    groupId: string;
    memberId: string;
    actionId: GuildMemberRowActionId;
    memberDriven: boolean;
    removeOldOwner?: boolean;
    autoVote?: boolean;
  }
) {
  const {
    accountId,
    wallet,
    groupId,
    memberId,
    actionId,
    memberDriven,
    removeOldOwner,
    autoVote = true,
  } = input;
  const configPath = guildGroupConfigPath(groupId);
  const ownerLedPermissions = () =>
    walletPermissionsClient(accountId, wallet).permissions;
  const proposeOpts = { autoVote };

  switch (actionId) {
    case 'make-mod':
    case 'demote-to-mod':
      if (memberDriven) {
        return client.groups.proposePermissionChange(
          groupId,
          {
            targetUser: memberId,
            level: PERMISSION.MODERATE,
            reason:
              actionId === 'demote-to-mod'
                ? 'Move to mod team'
                : 'Promote to mod team',
          },
          proposeOpts
        );
      }
      return ownerLedPermissions().grant(memberId, configPath, PERMISSION.MODERATE);
    case 'remove-mod':
    case 'make-member':
      if (memberDriven) {
        return client.groups.proposePermissionChange(
          groupId,
          {
            targetUser: memberId,
            level: PERMISSION.WRITE,
            reason: 'Make regular member',
          },
          proposeOpts
        );
      }
      return ownerLedPermissions().grant(memberId, configPath, PERMISSION.WRITE);
    case 'make-admin':
      if (memberDriven) {
        return client.groups.proposePermissionChange(
          groupId,
          {
            targetUser: memberId,
            level: PERMISSION.MANAGE,
            reason: 'Promote to admin team',
          },
          proposeOpts
        );
      }
      return ownerLedPermissions().grant(memberId, configPath, PERMISSION.MANAGE);
    case 'remove-admin':
      if (memberDriven) {
        return client.groups.proposePermissionChange(
          groupId,
          {
            targetUser: memberId,
            level: PERMISSION.WRITE,
            reason: 'Remove admin role',
          },
          proposeOpts
        );
      }
      return ownerLedPermissions().grant(memberId, configPath, PERMISSION.WRITE);
    case 'remove-from-guild':
      if (memberDriven) {
        return client.groups.proposeRemoveMember(
          groupId,
          memberId,
          {
            reason: 'Remove member',
            ...proposeOpts,
          }
        );
      }
      return client.groups.removeMember(groupId, memberId);
    case 'transfer-ownership':
      if (memberDriven) {
        return client.groups.proposeTransferOwnership(groupId, memberId, {
          reason: 'Transfer guild ownership',
          ...proposeOpts,
          ...(removeOldOwner !== undefined && { removeOldOwner }),
        });
      }
      return client.groups.transferOwnership(groupId, memberId, removeOldOwner);
    default:
      throw new Error(`Unsupported guild member action: ${actionId}`);
  }
}
