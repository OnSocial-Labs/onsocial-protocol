'use client';

import { useState } from 'react';
import { OsHugSheet, OsSheetAction, OsSheetActions } from '@onsocial/ui';

interface DmRecoveryCodeSheetProps {
  open: boolean;
  code: string;
  onClose: () => void;
}

/**
 * One-time recovery code for messaging keys.
 * Shown only when keys are first created on this device.
 */
export function DmRecoveryCodeSheet({
  open,
  code,
  onClose,
}: DmRecoveryCodeSheetProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const copied = open && copiedCode === code;

  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
      label="Recovery code"
      copy="Only you can see this · we cannot reset it"
      chrome="choice"
      closeAriaLabel="Close recovery code"
      backdropLabel="Close recovery code"
      footer={
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="button"
            ready
            succeeded={copied}
            succeededLabel="Copied"
            onClick={() => {
              void navigator.clipboard?.writeText(code).then(() => {
                setCopiedCode(code);
              });
            }}
          >
            Copy code
          </OsSheetAction>
          <OsSheetAction type="button" variant="ghost" onClick={onClose}>
            I saved it
          </OsSheetAction>
        </OsSheetActions>
      }
    >
      <div className="dm-recovery-sheet">
        <p className="dm-recovery-lead">
          Save this code to restore private messages on a new device. Anyone
          with it can read your DMs.
        </p>
        <p className="dm-recovery-code" aria-label="Recovery code">
          {code}
        </p>
      </div>
    </OsHugSheet>
  );
}
