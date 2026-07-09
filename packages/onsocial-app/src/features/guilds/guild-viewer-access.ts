import type { JoinRequest, OnSocial, Proposal } from '@onsocial/sdk';
import {
  findActiveJoinProposalForAccount,
  listActiveJoinRequestProposals,
  listSubmittedJoinRequestsFromEvents,
} from '@/features/guilds/guild-config';

export interface ResolvedGuildViewer {
  isMember: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  canModerate: boolean;
  joinRequest: JoinRequest | null;
  pendingJoinProposalId: string | null;
}

export interface ResolvedGuildModeration {
  pendingMemberRequestCount: number;
  activeProposalCount: number;
}

async function resolveMembershipRoles(
  client: OnSocial,
  groupId: string,
  accountId: string,
  membership: Awaited<
    ReturnType<OnSocial['query']['groups']['membershipFor']>
  > | null
): Promise<
  Pick<ResolvedGuildViewer, 'isMember' | 'isOwner' | 'isAdmin' | 'canModerate'>
> {
  // Privileged roles always come from chain views — indexer rows can exist with
  // stale or missing isOwner / isAdmin / canModerate flags.
  const [rpcIsOwner, rpcIsAdmin, rpcCanModerate, rpcIsMember] =
    await Promise.all([
      client.groups.isOwner(groupId, accountId),
      client.groups.isAdmin(groupId, accountId),
      client.groups.canModerate(groupId, accountId),
      membership
        ? Promise.resolve(true)
        : client.groups.isMember(groupId, accountId),
    ]);

  const isMember = Boolean(membership) || rpcIsMember || rpcIsOwner;
  if (!isMember) {
    return {
      isMember: false,
      isOwner: false,
      isAdmin: false,
      canModerate: false,
    };
  }

  return {
    isMember: true,
    isOwner: rpcIsOwner || (membership?.isOwner ?? false),
    isAdmin: rpcIsAdmin || (membership?.isAdmin ?? false),
    canModerate: rpcCanModerate || (membership?.canModerate ?? false),
  };
}

export async function resolveGuildViewerAccess(
  client: OnSocial,
  groupId: string,
  accountId: string,
  options: {
    memberDriven: boolean;
    accessGated: boolean;
  }
): Promise<{
  viewer: ResolvedGuildViewer;
  moderation: ResolvedGuildModeration | null;
}> {
  let membership: Awaited<
    ReturnType<OnSocial['query']['groups']['membershipFor']>
  > | null = null;
  try {
    membership = await client.query.groups.membershipFor(groupId, accountId);
  } catch {
    membership = null;
  }

  let joinRequest: JoinRequest | null = null;
  try {
    joinRequest = await client.groups.getJoinRequest(groupId, accountId);
  } catch {
    joinRequest = null;
  }

  const roles = await resolveMembershipRoles(
    client,
    groupId,
    accountId,
    membership
  );

  const canManage =
    roles.isOwner || roles.isAdmin || roles.canModerate;

  let proposals: Proposal[] = [];
  if (options.memberDriven && (!roles.isMember || canManage)) {
    try {
      proposals = await client.groups.listProposals(groupId, { limit: 40 });
    } catch {
      proposals = [];
    }
  }

  const pendingJoinProposal = options.memberDriven
    ? findActiveJoinProposalForAccount(proposals, accountId)
    : null;

  const viewer: ResolvedGuildViewer = {
    ...roles,
    joinRequest,
    pendingJoinProposalId: pendingJoinProposal?.id ?? null,
  };

  let moderation: ResolvedGuildModeration | null = null;
  if (canManage) {
    if (options.memberDriven) {
      moderation = {
        pendingMemberRequestCount: options.accessGated
          ? listActiveJoinRequestProposals(proposals).length
          : 0,
        activeProposalCount: proposals.filter(
          (proposal) =>
            proposal.status === 'active' && proposal.type !== 'join_request'
        ).length,
      };
    } else if (options.accessGated) {
      try {
        const events = await client.query.governance.joinRequests(groupId, {
          status: 'submitted',
          limit: 40,
        });
        moderation = {
          pendingMemberRequestCount:
            listSubmittedJoinRequestsFromEvents(events).length,
          activeProposalCount: 0,
        };
      } catch {
        moderation = {
          pendingMemberRequestCount: 0,
          activeProposalCount: 0,
        };
      }
    } else {
      moderation = {
        pendingMemberRequestCount: 0,
        activeProposalCount: 0,
      };
    }
  }

  return { viewer, moderation };
}
