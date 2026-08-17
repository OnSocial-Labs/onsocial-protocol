'use client';

import { OsActionDrawerConfirm } from '@onsocial/ui';
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
    <OsActionDrawerConfirm
      body={copy.body}
      confirmLabel={copy.confirmLabel}
      pending={pending}
      pendingLabel="Blocking…"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
