'use client';

import {
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  SheetFactCopy,
} from '@onsocial/ui';
import { deriveProtocolProposalView } from '@/features/protocol/protocol-card-view';
import {
  protocolVoteSheetLede,
  protocolVoteSheetMeta,
  protocolVoteSheetTitle,
} from '@/features/protocol/protocol-vote-sheet-copy';
import { PROTOCOL_TASK_SHEET_Z } from '@/features/protocol/protocol-sheet-z';
import type {
  ProtocolApplication,
  ProtocolDaoAction,
  ProtocolDaoPolicy,
} from '@/features/protocol/types';

function protocolVoteSheetActionsLayout(
  view: NonNullable<ReturnType<typeof deriveProtocolProposalView>>
): 'row-compact' | 'stack' {
  if (view.canFinalize) return 'stack';
  if (view.canApprove && view.canReject) return 'row-compact';
  return 'stack';
}

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
  const view = application
    ? deriveProtocolProposalView({
        application,
        accountId,
        daoPolicy,
        nowMs,
      })
    : null;

  const title = protocolVoteSheetTitle(view);
  const lede = view ? protocolVoteSheetLede(view) : null;
  const actionsLayout = view ? protocolVoteSheetActionsLayout(view) : 'stack';
  const rowVoteActions = actionsLayout === 'row-compact';
  const actionsReady = !pendingAction;

  const requestRemove = () => {
    const ok = window.confirm(
      'Remove this proposal from the board? This cannot be undone from the vote sheet.'
    );
    if (!ok) return;
    onAct('VoteRemove');
  };

  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
      label={title}
      {...(view?.headline ? { copy: view.headline } : {})}
      closeAriaLabel="Close actions"
      backdropLabel="Close actions"
      zIndex={PROTOCOL_TASK_SHEET_Z}
      initialDetent="peek"
      peekRatio={0.38}
      bodyClassName="protocol-action-sheet-body"
      footer={
        view &&
        (view.canApprove || view.canReject || view.canFinalize) ? (
          <div className="protocol-action-sheet-footer">
            <OsSheetActions
              layout={actionsLayout}
              tone="frosted-primary"
              borderless
              className="protocol-vote-sheet-actions protocol-vote-actions"
            >
              {rowVoteActions && view.canReject ? (
                <OsSheetAction
                  type="button"
                  variant="danger"
                  ready={actionsReady}
                  disabled={Boolean(pendingAction)}
                  pending={pendingAction === 'VoteReject'}
                  pendingLabel="Rejecting…"
                  onClick={() => onAct('VoteReject')}
                >
                  Reject
                </OsSheetAction>
              ) : null}
              {view.canApprove ? (
                <OsSheetAction
                  type="button"
                  variant="primary"
                  ready={actionsReady}
                  disabled={Boolean(pendingAction)}
                  pending={pendingAction === 'VoteApprove'}
                  pendingLabel="Approving…"
                  onClick={() => onAct('VoteApprove')}
                >
                  Approve
                </OsSheetAction>
              ) : null}
              {!rowVoteActions && view.canReject ? (
                <OsSheetAction
                  type="button"
                  variant="danger"
                  ready={actionsReady}
                  disabled={Boolean(pendingAction)}
                  pending={pendingAction === 'VoteReject'}
                  pendingLabel="Rejecting…"
                  onClick={() => onAct('VoteReject')}
                >
                  Reject
                </OsSheetAction>
              ) : null}
              {view.canFinalize ? (
                <OsSheetAction
                  type="button"
                  variant="primary"
                  ready={actionsReady}
                  disabled={Boolean(pendingAction)}
                  pending={pendingAction === 'Finalize'}
                  pendingLabel="Finalizing…"
                  onClick={() => onAct('Finalize')}
                >
                  {view.finalizeLabel}
                </OsSheetAction>
              ) : null}
            </OsSheetActions>
          </div>
        ) : undefined
      }
    >
      {view ? (
        <div className="protocol-action-summary">
          {lede ? (
            <SheetFactCopy className="protocol-action-lede">{lede}</SheetFactCopy>
          ) : null}
          <p className="protocol-action-meta">{protocolVoteSheetMeta(view)}</p>
          {view.canRemove && !view.canFinalize ? (
            <button
              type="button"
              className="protocol-action-remove"
              disabled={Boolean(pendingAction)}
              onClick={requestRemove}
            >
              {pendingAction === 'VoteRemove' ? 'Removing…' : 'Remove from board'}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="protocol-empty">Nothing to act on.</p>
      )}
    </OsHugSheet>
  );
}
