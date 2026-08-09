'use client';

import { useId } from 'react';
import {
  Divider,
  GlassSheet,
  PulsingDots,
  SheetHeader,
} from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import type { ProtocolApplication } from '@/features/protocol/types';
import {
  deriveProtocolProposalActions,
  proposalHeadline,
  proposalKindKey,
  resolveLiveProposal,
  statusLabel,
} from '@/features/protocol/protocol-card-view';
import type { ProtocolDaoAction, ProtocolDaoPolicy } from '@/features/protocol/types';
import { fallbackLabel } from '@/lib/profile-display';

export function ProtocolProposalSheet({
  open,
  onClose,
  application,
  daoPolicy,
  accountId,
  pendingAction,
  onAct,
}: {
  open: boolean;
  onClose: () => void;
  application: ProtocolApplication | null;
  daoPolicy: ProtocolDaoPolicy | null;
  accountId: string | null;
  pendingAction: ProtocolDaoAction | null;
  onAct: (action: ProtocolDaoAction) => void;
}) {
  const titleId = useId();
  const proposal = application ? resolveLiveProposal(application) : null;
  const headline = application ? proposalHeadline(application) : 'Proposal';
  const actions = deriveProtocolProposalActions({
    accountId,
    daoPolicy,
    proposal,
  });
  const description =
    proposal?.description?.trim() ||
    application?.description?.trim() ||
    application?.governance_proposal?.description?.trim() ||
    '';
  const kind = proposalKindKey(proposal);
  const status = statusLabel(proposal?.status);
  const proposer = proposal?.proposer?.trim() || '';

  return (
    <GlassSheet
      open={open}
      onClose={onClose}
      tone="os"
      initialDetent="full"
      peekRatio={1}
      zIndex={58}
      ariaLabelledBy={titleId}
      backdropLabel="Close proposal"
      bodyClassName="protocol-proposal-sheet-body"
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title={headline}
            subtitle={status}
            onClose={onClose}
            closeAriaLabel="Close proposal"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
      footer={
        actions.canApprove || actions.canReject || actions.canFinalize ? (
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            {actions.canApprove ? (
              <OsSheetAction
                type="button"
                variant="primary"
                ready={!pendingAction}
                disabled={Boolean(pendingAction)}
                pending={pendingAction === 'VoteApprove'}
                pendingLabel="Approving…"
                onClick={() => onAct('VoteApprove')}
              >
                Approve
              </OsSheetAction>
            ) : null}
            {actions.canReject ? (
              <OsSheetAction
                type="button"
                variant="ghost"
                ready={!pendingAction}
                disabled={Boolean(pendingAction)}
                pending={pendingAction === 'VoteReject'}
                pendingLabel="Rejecting…"
                onClick={() => onAct('VoteReject')}
              >
                Reject
              </OsSheetAction>
            ) : null}
            {actions.canFinalize ? (
              <OsSheetAction
                type="button"
                variant="primary"
                ready={!pendingAction}
                disabled={Boolean(pendingAction)}
                pending={pendingAction === 'Finalize'}
                pendingLabel="Finalizing…"
                onClick={() => onAct('Finalize')}
              >
                {actions.finalizeLabel}
              </OsSheetAction>
            ) : null}
          </OsSheetActions>
        ) : undefined
      }
    >
      {!application || !proposal ? (
        <p className="protocol-empty">Proposal unavailable.</p>
      ) : (
        <div className="protocol-proposal-detail">
          <div className="protocol-proposal-meta">
            <span className="protocol-pill">{kind}</span>
            <span className="protocol-pill is-status">{status}</span>
            {actions.currentVote ? (
              <span className="protocol-pill is-vote">
                You · {actions.currentVote}
              </span>
            ) : null}
          </div>
          {description ? (
            <p className="protocol-proposal-description">{description}</p>
          ) : null}
          <dl className="protocol-proposal-facts">
            {proposer ? (
              <div>
                <dt>Proposer</dt>
                <dd>@{fallbackLabel(proposer)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Votes</dt>
              <dd>
                {actions.approveVotes} approve · {actions.rejectVotes} reject
                {actions.removeVotes > 0
                  ? ` · ${actions.removeVotes} remove`
                  : ''}
              </dd>
            </div>
            {proposal.id != null ? (
              <div>
                <dt>Proposal</dt>
                <dd>#{proposal.id}</dd>
              </div>
            ) : null}
          </dl>
          {pendingAction ? (
            <p className="protocol-pending-hint">
              <PulsingDots aria-hidden /> Waiting for wallet…
            </p>
          ) : null}
        </div>
      )}
    </GlassSheet>
  );
}
