'use client';

import { OsActionDrawerConfirm } from '@onsocial/ui';
import { muteConfirmCopy } from '@/lib/block-confirm-copy';

interface MuteConfirmPanelProps {
  accountId: string;
  profileName?: string | null;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Two-step confirm body for ActionDrawer (Mute only — Unmute is immediate). */
export function MuteConfirmPanel({
  accountId,
  profileName,
  pending = false,
  onConfirm,
  onCancel,
}: MuteConfirmPanelProps) {
  const copy = muteConfirmCopy({ accountId, profileName });

  return (
    <OsActionDrawerConfirm
      body={copy.body}
      confirmLabel={copy.confirmLabel}
      pending={pending}
      pendingLabel="Muting…"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
