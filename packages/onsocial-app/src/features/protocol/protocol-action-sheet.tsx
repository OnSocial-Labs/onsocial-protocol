'use client';

import { useId } from 'react';
import { Divider, GlassSheet, SheetHeader } from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { deriveProtocolProposalView } from '@/features/protocol/protocol-card-view';
import type {
  ProtocolApplication,
  ProtocolDaoAction,
  ProtocolDaoPolicy,
} from '@/features/protocol/types';

/**
 * Actions-only sheet — proposal body stays on the Protocol page.
 */
export function ProtocolActionSheet({
  open,
  onClose,
  application,
  daoPolicy,
  accountId,
  pendingAction,
  nowMs,
  onAct,
}: {
  open: boolean;
  onClose: () => void;
  application: ProtocolApplication | null;
  daoPolicy: ProtocolDaoPolicy | null;
  accountId: string | null;
  pendingAction: ProtocolDaoAction | null;
  nowMs?: number;
  onAct: (action: ProtocolDaoAction) => void;
}) {
  const titleId = useId();
  const view = application
    ? deriveProtocolProposalView({
        application,
        accountId,
        daoPolicy,
        nowMs,
      })
    : null;

  const title = view?.canFinalize
    ? view.finalizeLabel
    : view
      ? 'Cast your vote'
      : 'Action';

  return (
    <GlassSheet
      open={open}
      onClose={onClose}
      tone="os"
      initialDetent="peek"
      peekRatio={0.42}
      zIndex={58}
      ariaLabelledBy={titleId}
      backdropLabel="Close actions"
      bodyClassName="protocol-action-sheet-body"
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title={title}
            subtitle={view?.headline}
            onClose={onClose}
            closeAriaLabel="Close actions"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
      footer={
        view &&
        (view.canApprove ||
          view.canReject ||
          view.canRemove ||
          view.canFinalize) ? (
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            {view.canApprove ? (
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
            {view.canReject ? (
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
            {view.canRemove ? (
              <OsSheetAction
                type="button"
                variant="ghost"
                ready={!pendingAction}
                disabled={Boolean(pendingAction)}
                pending={pendingAction === 'VoteRemove'}
                pendingLabel="Removing…"
                onClick={() => {
                  const ok = window.confirm(
                    'Remove this proposal from the board? This cannot be undone from the vote sheet.'
                  );
                  if (!ok) return;
                  onAct('VoteRemove');
                }}
              >
                Remove
              </OsSheetAction>
            ) : null}
            {view.canFinalize ? (
              <OsSheetAction
                type="button"
                variant="primary"
                ready={!pendingAction}
                disabled={Boolean(pendingAction)}
                pending={pendingAction === 'Finalize'}
                pendingLabel="Finalizing…"
                onClick={() => onAct('Finalize')}
              >
                {view.finalizeLabel}
              </OsSheetAction>
            ) : null}
          </OsSheetActions>
        ) : undefined
      }
    >
      {view ? (
        <div className="protocol-action-summary">
          <p className="protocol-action-lede">
            {view.canFinalize
              ? 'Close this proposal on-chain when the review window ends or a retry is needed.'
              : 'Your vote is recorded on the DAO. You can only vote once.'}
          </p>
          <dl className="protocol-action-facts">
            <div>
              <dt>Status</dt>
              <dd>{view.statusLabel}</dd>
            </div>
            <div>
              <dt>Tally</dt>
              <dd>
                {view.approveVotes} approve · {view.rejectVotes} reject
              </dd>
            </div>
            {view.roleName ? (
              <div>
                <dt>Your role</dt>
                <dd>{view.roleName}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : (
        <p className="protocol-empty">Nothing to act on.</p>
      )}
    </GlassSheet>
  );
}
