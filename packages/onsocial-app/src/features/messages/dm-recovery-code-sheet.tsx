'use client';

import { OsGestureSheet, OsSheetAction, OsSheetActions } from '@onsocial/ui';

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
  return (
    <OsGestureSheet
      open={open}
      onClose={onClose}
      verb="Save"
      personName="recovery code"
      signal="standing"
      whisper="Only you can see this · we cannot reset it"
      closeAriaLabel="Close recovery code"
      size="compact"
    >
      <div className="dm-recovery-sheet">
        <p className="dm-recovery-lead">
          Save this code to restore private messages on a new device. Anyone
          with it can read your DMs.
        </p>
        <p className="dm-recovery-code" aria-label="Recovery code">
          {code}
        </p>
        <OsSheetActions>
          <OsSheetAction
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(code);
            }}
          >
            Copy code
          </OsSheetAction>
          <OsSheetAction
            type="button"
            variant="ghost"
            onClick={onClose}
          >
            I saved it
          </OsSheetAction>
        </OsSheetActions>
      </div>
    </OsGestureSheet>
  );
}
