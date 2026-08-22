import type { OnSocial, PostRow } from '@onsocial/sdk';
import {
  canViewerPostInChannel,
  parseGuildStructure,
  type GuildViewerAccess,
} from '@/features/guilds/guild-structure';
import { resolveViewerAllowlistSpaceIds } from '@/features/guilds/guild-space-write';
import { resolveGuildViewerAccess } from '@/features/guilds/guild-viewer-access';

/**
 * Ensure the viewer may reply/quote in the room that owns a guild post.
 * Throws a human-readable error when membership or allowlist policy blocks.
 */
export async function assertCanReplyToGuildPost(
  client: OnSocial,
  accountId: string,
  target: PostRow
): Promise<void> {
  const groupId = target.groupId;
  if (!groupId) return;

  const rawConfig = await client.groups.getConfig(groupId);
  if (!rawConfig) {
    throw new Error('Could not load this guild.');
  }

  const structure = parseGuildStructure(rawConfig);
  const { viewer } = await resolveGuildViewerAccess(client, groupId, accountId, {
    memberDriven:
      rawConfig.member_driven === true || rawConfig.memberDriven === true,
    accessGated:
      rawConfig.is_private === true || rawConfig.isPrivate === true,
  });

  if (!viewer.isMember) {
    throw new Error('Join this guild to reply, quote, or repost.');
  }

  const canWriteSpaceIds = await resolveViewerAllowlistSpaceIds(
    client,
    groupId,
    accountId,
    structure,
    viewer
  );
  const access: GuildViewerAccess = {
    isMember: viewer.isMember,
    isOwner: viewer.isOwner,
    isAdmin: viewer.isAdmin,
    canModerate: viewer.canModerate,
    canWriteSpaceIds,
  };

  if (!canViewerPostInChannel(structure, target.channel, access)) {
    throw new Error('You cannot reply in this room.');
  }
}
