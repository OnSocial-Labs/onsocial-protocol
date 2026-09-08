import type { OnSocial } from '@onsocial/sdk';

export const GUILD_MEMBERSHIP_CONFIRM_LEAVE_MS = 4_000;

export type GuildMembershipOutcome =
  | 'left'
  | 'canceled'
  | 'requested'
  | 'joined';

export type GuildMembershipActionSnapshot = {
  isMember: boolean;
  joinPending: boolean;
  isOwner: boolean;
  isBlacklisted: boolean;
  accessGated: boolean;
  memberDriven: boolean;
  pendingJoinProposalId: string | null;
  joinCancelReady: boolean;
};

export function guildMembershipOutcome(input: {
  wasMember: boolean;
  wasJoinPending: boolean;
  accessGated: boolean;
}): GuildMembershipOutcome {
  if (input.wasMember) return 'left';
  if (input.wasJoinPending) return 'canceled';
  return input.accessGated ? 'requested' : 'joined';
}

export function nextGuildMembershipCache(input: {
  wasMember: boolean;
  wasJoinPending: boolean;
  accessGated: boolean;
}): { isMember: boolean; joinPending: boolean } {
  if (input.wasMember || input.wasJoinPending) {
    return { isMember: false, joinPending: false };
  }
  return {
    isMember: !input.accessGated,
    joinPending: input.accessGated,
  };
}

export async function requestGuildMembershipChange(
  client: OnSocial,
  input: {
    groupId: string;
    isMember: boolean;
    joinPending: boolean;
    memberDriven: boolean;
    pendingJoinProposalId: string | null;
  }
) {
  if (input.isMember) return client.groups.leave(input.groupId);
  if (input.joinPending) {
    if (input.memberDriven && input.pendingJoinProposalId) {
      return client.groups.cancelProposal(
        input.groupId,
        input.pendingJoinProposalId
      );
    }
    return client.groups.cancelJoin(input.groupId);
  }
  return client.groups.join(input.groupId);
}
