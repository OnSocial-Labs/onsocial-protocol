import type { NearWalletBase } from '@hot-labs/near-connect';
import type { OnSocial, RelayResponse } from '@onsocial/sdk';
import { PERMISSION } from '@onsocial/sdk';
import {
  allowlistLeaders,
  allowlistWriterCandidates,
  readGuildOwnerId,
  reconcileGuildMemberRoster,
} from '@/features/guilds/guild-member-roster';
import {
  enabledGuildSpaces,
  guildSpaceWritePath,
  type GuildStructureDocument,
  type GuildViewerAccess,
} from '@/features/guilds/guild-structure';
import { createAppOnSocialClient } from '@/lib/create-app-onsocial-client';

/** Owner-led allowlist grants hit `execute_admin` and need wallet broadcast. */
function walletPermissionsClient(
  accountId: string,
  wallet: NearWalletBase
): OnSocial {
  return createAppOnSocialClient(accountId, wallet);
}

/**
 * Resolve which allowlist rooms the viewer can post in via space WRITE grants.
 * Leaders skip the lookup — `canPostToGuildSpace` already allows them.
 */
export async function resolveViewerAllowlistSpaceIds(
  client: OnSocial,
  groupId: string,
  accountId: string,
  structure: GuildStructureDocument,
  viewer: Pick<GuildViewerAccess, 'isMember' | 'isAdmin' | 'isOwner'>
): Promise<ReadonlySet<string>> {
  if (!viewer.isMember || viewer.isAdmin || viewer.isOwner) {
    return new Set();
  }

  const allowlistSpaces = enabledGuildSpaces(structure).filter(
    (space) => space.postPolicy === 'allowlist'
  );
  if (allowlistSpaces.length === 0) return new Set();

  const granted = await Promise.all(
    allowlistSpaces.map(async (space) => {
      const path = guildSpaceWritePath(groupId, space.id);
      try {
        const ok = await client.permissions.has(
          groupId,
          accountId,
          path,
          PERMISSION.WRITE
        );
        return ok ? space.id : null;
      } catch {
        return null;
      }
    })
  );

  return new Set(granted.filter((id): id is string => Boolean(id)));
}

export async function grantGuildSpaceWrite(input: {
  client: OnSocial;
  accountId: string;
  wallet: NearWalletBase;
  groupId: string;
  spaceId: string;
  memberId: string;
  memberDriven: boolean;
  spaceTitle?: string;
}): Promise<RelayResponse> {
  const path = guildSpaceWritePath(input.groupId, input.spaceId);
  const reason = input.spaceTitle
    ? `Allow sharing in ${input.spaceTitle}`
    : 'Allow sharing in room';

  // Leaders already post to allowlist rooms — never grant/propose for them.
  const [isOwner, isAdmin] = await Promise.all([
    input.client.groups.isOwner(input.groupId, input.memberId),
    input.client.groups.isAdmin(input.groupId, input.memberId),
  ]);
  if (isOwner || isAdmin) {
    throw new Error('Leaders can already share in this room.');
  }

  if (input.memberDriven) {
    return input.client.groups.proposePermissionGrant(
      input.groupId,
      {
        targetUser: input.memberId,
        path,
        level: PERMISSION.WRITE,
        reason,
      },
      { autoVote: true }
    );
  }

  return walletPermissionsClient(
    input.accountId,
    input.wallet
  ).permissions.grant(input.memberId, path, PERMISSION.WRITE);
}

export async function revokeGuildSpaceWrite(input: {
  client: OnSocial;
  accountId: string;
  wallet: NearWalletBase;
  groupId: string;
  spaceId: string;
  memberId: string;
  memberDriven: boolean;
  spaceTitle?: string;
}): Promise<RelayResponse> {
  const path = guildSpaceWritePath(input.groupId, input.spaceId);
  const reason = input.spaceTitle
    ? `Remove sharing in ${input.spaceTitle}`
    : 'Remove sharing in room';

  if (input.memberDriven) {
    return input.client.groups.proposePermissionRevoke(
      input.groupId,
      {
        targetUser: input.memberId,
        path,
        reason,
      },
      { autoVote: true }
    );
  }

  return walletPermissionsClient(
    input.accountId,
    input.wallet
  ).permissions.revoke(input.memberId, path);
}

export async function memberHasGuildSpaceWrite(
  client: OnSocial,
  groupId: string,
  memberId: string,
  spaceId: string
): Promise<boolean> {
  const path = guildSpaceWritePath(groupId, spaceId);
  try {
    return await client.permissions.has(
      groupId,
      memberId,
      path,
      PERMISSION.WRITE
    );
  } catch {
    return false;
  }
}

/** Non-leader grant count + leader count for allowlist room facts. */
export async function loadGuildSpaceWriterCounts(
  client: OnSocial,
  groupId: string,
  spaceId: string
): Promise<{ grantedCount: number; leaderCount: number }> {
  const [config, page] = await Promise.all([
    client.groups.getConfig(groupId),
    client.query.groups.membersOf(groupId, { limit: 120 }),
  ]);
  const ownerId = readGuildOwnerId(config);
  // Indexer membership flags for leader vs candidate split — no N× role RPCs.
  const reconciled = reconcileGuildMemberRoster(page.items ?? [], ownerId);
  const leaders = allowlistLeaders(reconciled, ownerId);
  const roster = allowlistWriterCandidates(reconciled, ownerId);
  if (roster.length === 0) {
    return { grantedCount: 0, leaderCount: leaders.length };
  }

  const flags = await Promise.all(
    roster.map((member) =>
      memberHasGuildSpaceWrite(client, groupId, member.memberId, spaceId)
    )
  );
  return {
    grantedCount: flags.filter(Boolean).length,
    leaderCount: leaders.length,
  };
}

export type GuildSpaceWritersShareDisplay =
  | { kind: 'loading' }
  | { kind: 'leaders-only' }
  | { kind: 'count'; count: number };

/** Facts-row display for allowlist rooms — mirrors guild “N members”. */
export function guildSpaceWritersShareDisplay(
  grantedCount: number,
  leaderCount: number
): Exclude<GuildSpaceWritersShareDisplay, { kind: 'loading' }> {
  if (grantedCount <= 0) return { kind: 'leaders-only' };
  return { kind: 'count', count: leaderCount + grantedCount };
}
