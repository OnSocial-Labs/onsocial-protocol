'use client';

import { OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { dropDeleteConfirmCopy } from '@/lib/drop-delete-confirm-copy';

interface DropDeleteConfirmPanelProps {
  title?: string | null;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Two-step confirm body for ActionDrawer / Drop Manage (Delete only). */
export function DropDeleteConfirmPanel({
  title,
  pending = false,
  onConfirm,
  onCancel,
}: DropDeleteConfirmPanelProps) {
  const copy = dropDeleteConfirmCopy({ title });

  return (
    <div className="action-drawer-confirm">
      <p className="action-drawer-confirm-body">{copy.body}</p>
      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type="button"
          variant="danger"
          ready
          pending={pending}
          pendingLabel="Deleting…"
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
