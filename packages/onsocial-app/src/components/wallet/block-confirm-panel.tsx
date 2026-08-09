'use client';

import { OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { blockConfirmCopy } from '@/lib/block-confirm-copy';

interface BlockConfirmPanelProps {
  accountId: string;
  profileName?: string | null;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Two-step confirm body for ActionDrawer (Block only — Unblock is immediate). */
export function BlockConfirmPanel({
  accountId,
  profileName,
  pending = false,
  onConfirm,
  onCancel,
}: BlockConfirmPanelProps) {
  const copy = blockConfirmCopy({ accountId, profileName });

  return (
    <div className="action-drawer-confirm">
      <p className="action-drawer-confirm-body">{copy.body}</p>
      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type="button"
          variant="primary"
          ready
          pending={pending}
          pendingLabel="Blocking…"
          disabled={pending}
          onClick={onConfirm}
        >
          {copy.confirmLabel}
        </OsSheetAction>
      </OsSheetActions>
      {!pending ? (
        <button
          type="button"
          className="action-drawer-confirm-cancel"
          onClick={onCancel}
        >
          Cancel
        </button>
      ) : null}
    </div>
  );
}
