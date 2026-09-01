import type { ComposerProposalDraft } from '@/features/guilds/guild-composer-sheet';

export function isProposalComposeDraftReady(
  proposal: ComposerProposalDraft | null | undefined
): proposal is ComposerProposalDraft {
  return Boolean(
    proposal?.groupId?.trim() && proposal.proposalId?.trim()
  );
}

/** Durable proposal embed for posts.create / groups.post. */
export function proposalEmbedFromDraft(proposal: ComposerProposalDraft) {
  const groupId = proposal.groupId.trim();
  const proposalId = proposal.proposalId.trim();
  if (!groupId || !proposalId) {
    throw new Error('proposalEmbedFromDraft requires groupId and proposalId');
  }
  return {
    kind: 'proposal' as const,
    groupId,
    proposalId,
  };
}

/** Optional first-paint snapshot under `x.onsocial.proposal`. */
export function proposalSnapshotExtra(proposal: ComposerProposalDraft) {
  const groupId = proposal.groupId.trim();
  const proposalId = proposal.proposalId.trim();
  return {
    onsocial: {
      proposal: {
        groupId,
        proposalId,
        title: proposal.title.trim() || 'Proposal',
        ...(proposal.kind?.trim() ? { kind: proposal.kind.trim() } : {}),
        ...(proposal.status?.trim()
          ? { status: proposal.status.trim() }
          : {}),
        ...(proposal.groupName?.trim()
          ? { groupName: proposal.groupName.trim() }
          : {}),
      },
    },
  };
}

/** Caption written on-chain and into optimistic JSON (never blank for tag-only). */
export function resolvedProposalPostText(
  text: string,
  proposal: ComposerProposalDraft | null | undefined
): string {
  const trimmed = text.trim();
  if (trimmed) return trimmed;
  if (!isProposalComposeDraftReady(proposal)) return '';
  return proposal.title.trim() || 'Proposal';
}
