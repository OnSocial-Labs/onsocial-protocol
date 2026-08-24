import type { deriveProtocolProposalView } from '@/features/protocol/protocol-card-view';
import type { ProtocolDaoVote } from '@/features/protocol/types';
import { formatDaoRoleLabel } from '@/lib/page-drawer-meta';

type ProtocolVoteSheetView = Pick<
  NonNullable<ReturnType<typeof deriveProtocolProposalView>>,
  | 'canFinalize'
  | 'finalizeLabel'
  | 'roleName'
  | 'statusLabel'
  | 'status'
  | 'approveVotes'
  | 'rejectVotes'
  | 'currentVote'
  | 'canApprove'
  | 'canReject'
  | 'deadline'
>;

export function protocolVoteSheetTitle(
  view: ProtocolVoteSheetView | null
): string {
  if (!view) return 'Action';
  if (view.canFinalize) return view.finalizeLabel;
  return 'Vote';
}

export function protocolVoteSheetChoiceLabel(vote: ProtocolDaoVote): string {
  switch (vote) {
    case 'Approve':
      return 'Approved';
    case 'Reject':
      return 'Rejected';
    case 'Remove':
      return 'Removed';
    default:
      return vote;
  }
}

export function protocolVoteSheetLede(view: ProtocolVoteSheetView): string | null {
  if (view.canFinalize) {
    return 'Close on-chain when the review window ends or a retry is needed.';
  }
  if (view.currentVote) {
    return `You ${protocolVoteSheetChoiceLabel(view.currentVote).toLowerCase()} this proposal.`;
  }
  return null;
}

/** One quiet status line under the proposal headline. */
export function protocolVoteSheetMeta(view: ProtocolVoteSheetView): string {
  const parts: string[] = [];

  if (view.roleName && !view.canApprove && !view.canReject) {
    parts.push(formatDaoRoleLabel(view.roleName));
  }

  parts.push(view.statusLabel);
  parts.push(`${view.approveVotes} approve · ${view.rejectVotes} reject`);

  if (
    view.deadline &&
    !view.deadline.expired &&
    view.status === 'InProgress'
  ) {
    parts.push(`${view.deadline.prefix} ${view.deadline.relative}`);
  }

  if (view.currentVote && !view.canApprove && !view.canReject) {
    parts.push(protocolVoteSheetChoiceLabel(view.currentVote));
  }

  return parts.join(' · ');
}
