import type { OnSocial } from '@onsocial/sdk';

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

/** Wallet membership actions that confirm in the action drawer first. */
export type GuildMembershipConfirmKind = 'join' | 'request' | 'cancel' | 'leave';

export function guildMembershipConfirmKind(
  snapshot: GuildMembershipActionSnapshot
): GuildMembershipConfirmKind | 'owner' | null {
  if (snapshot.isBlacklisted) return null;
  if (snapshot.joinPending && !snapshot.joinCancelReady) return null;
  if (snapshot.isMember && snapshot.isOwner) return 'owner';
  if (snapshot.isMember) return 'leave';
  if (snapshot.joinPending) return 'cancel';
  return snapshot.accessGated ? 'request' : 'join';
}

export function guildMembershipConfirmCopy(kind: GuildMembershipConfirmKind): {
  label: string;
  confirmLabel: string;
  pendingLabel: string;
  variant: 'primary' | 'danger';
} {
  switch (kind) {
    case 'leave':
      return {
        label: 'Leave',
        confirmLabel: 'Leave',
        pendingLabel: 'Leaving…',
        variant: 'danger',
      };
    case 'cancel':
      return {
        label: 'Cancel request',
        confirmLabel: 'Cancel request',
        pendingLabel: 'Canceling…',
        variant: 'danger',
      };
    case 'request':
      return {
        label: 'Request',
        confirmLabel: 'Request',
        pendingLabel: 'Requesting…',
        variant: 'primary',
      };
    case 'join':
      return {
        label: 'Join',
        confirmLabel: 'Join',
        pendingLabel: 'Joining…',
        variant: 'primary',
      };
  }
}
