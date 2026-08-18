'use client';

import { OsActionDrawerConfirm } from '@onsocial/ui';
import { dropWithdrawRefundsCopy } from '@/lib/drop-cancel-confirm-copy';

interface DropWithdrawRefundsConfirmPanelProps {
  title?: string | null;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirm reclaiming leftover refund pool NEAR after the claim window. */
export function DropWithdrawRefundsConfirmPanel({
  title,
  pending = false,
  onConfirm,
  onCancel,
}: DropWithdrawRefundsConfirmPanelProps) {
  const copy = dropWithdrawRefundsCopy({ title });

  return (
    <OsActionDrawerConfirm
      body={copy.body}
      confirmLabel={copy.confirmLabel}
      pending={pending}
      pendingLabel="Withdrawing…"
      variant="primary"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
