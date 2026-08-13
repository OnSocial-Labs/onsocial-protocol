'use client';

import { OsActionDrawerConfirm } from '@onsocial/ui';
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
    <OsActionDrawerConfirm
      body={copy.body}
      confirmLabel={copy.confirmLabel}
      pending={pending}
      pendingLabel="Deleting…"
      variant="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
