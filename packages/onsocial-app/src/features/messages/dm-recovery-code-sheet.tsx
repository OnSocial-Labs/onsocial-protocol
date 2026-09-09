'use client';

import { useState } from 'react';
import { OsHugSheet, OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { canOfferDmPasskey, enrollDmPasskeyUnlock } from '@/lib/dm/keys';
import {
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

interface DmRecoveryCodeSheetProps {
  open: boolean;
  code: string;
  accountId?: string | null;
  /** Passive close (X / backdrop) — does NOT acknowledge the code. */
  onClose: () => void;
  /** Explicit “I saved it” — acknowledge + dismiss. */
  onAcknowledge: () => void;
  onPasskeyEnrolled?: () => void;
  /** After key reset — emphasize that old messages are gone. */
  variant?: 'created' | 'reset';
}

/**
 * One-time recovery code for messaging keys.
 * Shown when keys were just created or a pending code remains.
 * Backdrop/X dismiss keeps the code pending so it can reappear.
 */
export function DmRecoveryCodeSheet({
  open,
  code,
  accountId,
  onClose,
  onAcknowledge,
  onPasskeyEnrolled,
  variant = 'created',
}: DmRecoveryCodeSheetProps) {
  const { setTxResult } = useAppTransactionFeedback();
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeyDone, setPasskeyDone] = useState(false);
  const showPasskey = Boolean(accountId && canOfferDmPasskey() && !passkeyDone);

  const handleCopyCode = () => {
    void (async () => {
      try {
        if (!navigator.clipboard?.writeText) {
          throw new Error('clipboard unavailable');
        }
        await navigator.clipboard.writeText(code);
        setTxResult({
          type: 'success',
          msg: txToastSuccess.recoveryCodeCopied,
        });
      } catch {
        setTxResult({
          type: 'error',
          msg: txToastError.recoveryCodeCopyFailed,
        });
      }
    })();
  };

  const handleEnrollPasskey = async () => {
    if (!accountId) return;
    setPasskeyError(null);
    setPasskeyPending(true);
    try {
      const result = await enrollDmPasskeyUnlock(accountId);
      if (!result.ok) {
        if (result.reason === 'cancelled') return;
        if (result.reason === 'unsupported') {
          setPasskeyError('Passkey unlock isn’t available on this device.');
          return;
        }
        setPasskeyError('Couldn’t enable passkey unlock. You can try later.');
        return;
      }
      setPasskeyDone(true);
      onPasskeyEnrolled?.();
    } finally {
      setPasskeyPending(false);
    }
  };

  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
      label={variant === 'reset' ? 'New recovery code' : 'Recovery code'}
      copy={
        variant === 'reset'
          ? 'Old messages stay sealed · we cannot open them'
          : 'Only you can see this · we cannot reset it'
      }
      chrome="choice"
      closeAriaLabel="Close recovery code"
      backdropLabel="Close recovery code"
      footer={
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction type="button" ready onClick={handleCopyCode}>
            Copy code
          </OsSheetAction>
          {showPasskey ? (
            <OsSheetAction
              type="button"
              ready={!passkeyPending}
              pending={passkeyPending}
              pendingLabel="Enabling…"
              onClick={() => void handleEnrollPasskey()}
            >
              Unlock with this device
            </OsSheetAction>
          ) : null}
          <OsSheetAction type="button" variant="ghost" onClick={onAcknowledge}>
            I saved it
          </OsSheetAction>
        </OsSheetActions>
      }
    >
      <div className="dm-recovery-sheet">
        <p className="dm-recovery-lead">
          {variant === 'reset'
            ? 'Old private messages can’t be opened anymore. Save this new code for future devices — anyone with it can read your new DMs.'
            : 'Save this code to restore private messages on a new device. Anyone with it can read your DMs.'}
        </p>
        <p className="dm-recovery-code" aria-label="Recovery code">
          {code}
        </p>
        {passkeyDone ? (
          <p className="dm-recovery-lead">
            Passkey unlock is on for this device. Use your recovery code on new
            devices.
          </p>
        ) : null}
        {passkeyError ? (
          <p className="dm-compose-error" role="alert">
            {passkeyError}
          </p>
        ) : null}
      </div>
    </OsHugSheet>
  );
}
