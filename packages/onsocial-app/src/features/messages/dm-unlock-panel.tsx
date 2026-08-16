'use client';

import { useId, useState } from 'react';
import {
  OsActionDrawerConfirm,
  OsField,
  OsSheetAction,
  OsSheetActions,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  canOfferDmPasskey,
  hasDmPasskeyEnrolled,
  resetDmMessagingKeys,
  restoreDmKeysFromRecoveryCode,
  unlockDmKeysWithPasskey,
} from '@/lib/dm/keys';
import { lookupDmKeyBackup } from '@/lib/dm/pubkey';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

type DmUnlockPanelProps = {
  accountId: string;
  /** Compact layout for sheets vs Messages page. */
  compact?: boolean;
  onUnlocked: () => void;
  /**
   * Called after a successful key reset with the new recovery code.
   * Parent should show the recovery sheet and treat keys as unlocked.
   */
  onReset?: (recoveryCode: string) => void;
};

/**
 * Recovery code + optional passkey unlock. Shared by Messages inbox and compose.
 * Reset confirm reuses {@link OsActionDrawerConfirm} (same chrome as block/delete).
 */
export function DmUnlockPanel({
  accountId,
  compact = false,
  onUnlocked,
  onReset,
}: DmUnlockPanelProps) {
  const { getClient } = useAppOnSocialClient();
  const { hasSocialSession } = useAppWallet();
  const resetTitleId = useId();
  const resetBodyId = useId();
  const [recoveryInput, setRecoveryInput] = useState('');
  const [unlockPending, setUnlockPending] = useState(false);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passkeyEnrolled = hasDmPasskeyEnrolled(accountId);
  const canPasskey = canOfferDmPasskey();
  const busy = unlockPending || passkeyPending || resetPending;

  const handleRestore = async () => {
    if (!recoveryInput.trim()) return;
    setUnlockPending(true);
    setError(null);
    try {
      const { client } = await getClient();
      const remote = await lookupDmKeyBackup(client, accountId);
      if (remote.status === 'unavailable') {
        setError(
          'Could not verify messaging keys. Check your connection and try again.'
        );
        return;
      }
      await restoreDmKeysFromRecoveryCode({
        accountId,
        recoveryCode: recoveryInput.trim(),
        remoteBackup: remote.status === 'found' ? remote.value : null,
        preferRemote: remote.status === 'found',
      });
      setRecoveryInput('');
      setResetConfirm(false);
      onUnlocked();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not restore keys.'
      );
    } finally {
      setUnlockPending(false);
    }
  };

  const handlePasskeyUnlock = async () => {
    setPasskeyPending(true);
    setError(null);
    try {
      await unlockDmKeysWithPasskey(accountId);
      setResetConfirm(false);
      onUnlocked();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not unlock with passkey.'
      );
    } finally {
      setPasskeyPending(false);
    }
  };

  const handleReset = async () => {
    setResetPending(true);
    setError(null);
    try {
      if (!hasSocialSession) {
        setError('Connect your session to reset messaging keys.');
        return;
      }
      const { client } = await getClient();
      const result = await resetDmMessagingKeys({ accountId, client });
      setResetConfirm(false);
      setRecoveryInput('');
      if (onReset) {
        onReset(result.recoveryCode);
      } else {
        onUnlocked();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not reset messaging keys.'
      );
    } finally {
      setResetPending(false);
    }
  };

  return (
    <section
      className="messages-unlock"
      aria-label="Unlock messages"
      data-compact={compact ? 'true' : undefined}
    >
      {resetConfirm ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={resetTitleId}
          aria-describedby={resetBodyId}
        >
          <p id={resetTitleId} className="messages-unlock-title">
            Reset messaging keys?
          </p>
          <div id={resetBodyId}>
            <OsActionDrawerConfirm
              body="Old private messages stay sealed forever. New ones open after you save a new recovery code."
              confirmLabel="Reset keys"
              cancelLabel="Keep trying"
              variant="danger"
              pending={resetPending}
              pendingLabel="Resetting…"
              onConfirm={() => void handleReset()}
              onCancel={() => setResetConfirm(false)}
            >
              {error ? (
                <p className="dm-compose-error" role="alert">
                  {error}
                </p>
              ) : null}
            </OsActionDrawerConfirm>
          </div>
        </div>
      ) : (
        <>
          <p className="messages-unlock-title">
            {passkeyEnrolled
              ? 'Unlock private messages on this device.'
              : 'Enter your recovery code to unlock.'}
          </p>
          {passkeyEnrolled && canPasskey ? (
            <OsSheetActions layout="stack">
              <OsSheetAction
                type="button"
                ready={!busy}
                pending={passkeyPending}
                pendingLabel="Unlocking…"
                onClick={() => void handlePasskeyUnlock()}
              >
                Unlock with this device
              </OsSheetAction>
            </OsSheetActions>
          ) : null}
          <OsField
            label={passkeyEnrolled ? 'Or recovery code' : 'Recovery code'}
            htmlFor={compact ? 'dm-compose-unlock-code' : 'dm-unlock-code'}
          >
            <input
              id={compact ? 'dm-compose-unlock-code' : 'dm-unlock-code'}
              className={osFieldBorderedClassName}
              value={recoveryInput}
              onChange={(e) => setRecoveryInput(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              autoComplete="off"
              disabled={busy}
            />
          </OsField>
          <OsSheetActions layout="stack">
            <OsSheetAction
              type="button"
              ready={Boolean(recoveryInput.trim()) && !busy}
              pending={unlockPending}
              pendingLabel="Unlocking…"
              onClick={() => void handleRestore()}
            >
              Unlock with code
            </OsSheetAction>
            <OsSheetAction
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setError(null);
                setResetConfirm(true);
              }}
            >
              Lost your recovery code?
            </OsSheetAction>
          </OsSheetActions>
          {error ? (
            <p className="dm-compose-error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
