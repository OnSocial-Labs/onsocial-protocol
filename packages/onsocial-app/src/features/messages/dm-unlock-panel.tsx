'use client';

import { useEffect, useId, useRef, useState } from 'react';
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
  DmKeysMismatchError,
  canOfferDmPasskey,
  ensureDmKeys,
  hasDmPasskeyEnrolled,
  resetDmMessagingKeys,
  restoreDmKeysFromRecoveryCode,
  unlockDmKeysWithPasskey,
} from '@/lib/dm/keys';
import { lookupDmKeyBackup } from '@/lib/dm/pubkey';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function isPasskeyUnlockCancellation(cause: unknown): boolean {
  return (
    cause instanceof Error && cause.message === 'Passkey unlock cancelled.'
  );
}

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
  const codeInputId = useId();
  const [recoveryInput, setRecoveryInput] = useState('');
  const [unlockPending, setUnlockPending] = useState(false);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passkeyEnrolled = hasDmPasskeyEnrolled(accountId);
  const canPasskey = canOfferDmPasskey();
  const passkeyPrimary = passkeyEnrolled && canPasskey;
  const [recoveryMode, setRecoveryMode] = useState(() => !passkeyPrimary);
  const autoPromptedRef = useRef(false);
  const busy = unlockPending || passkeyPending || resetPending;

  useEffect(() => {
    autoPromptedRef.current = false;
    setRecoveryMode(!passkeyPrimary);
    setRecoveryInput('');
    setError(null);
  }, [accountId, passkeyPrimary]);

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
      // Verify profile identity before leaving unlock chrome — stale passkeys
      // after a reset elsewhere must not look like a successful unlock.
      const { client } = await getClient();
      const remote = await lookupDmKeyBackup(client, accountId);
      if (remote.status === 'unavailable') {
        setError(
          'Could not verify messaging keys. Check your connection and try again.'
        );
        return;
      }
      await unlockDmKeysWithPasskey(accountId);
      if (remote.status === 'found') {
        try {
          await ensureDmKeys(accountId, { remote });
        } catch (cause) {
          if (cause instanceof DmKeysMismatchError) {
            setError(cause.message);
            return;
          }
          throw cause;
        }
      }
      setResetConfirm(false);
      onUnlocked();
    } catch (cause) {
      if (isPasskeyUnlockCancellation(cause)) return;
      if (
        cause instanceof Error &&
        cause.message.includes('cannot unlock with a passkey')
      ) {
        setRecoveryMode(true);
      }
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not unlock with passkey.'
      );
    } finally {
      setPasskeyPending(false);
    }
  };

  useEffect(() => {
    if (!passkeyPrimary || recoveryMode || resetConfirm || autoPromptedRef.current) {
      return;
    }
    autoPromptedRef.current = true;
    void handlePasskeyUnlock();
    // Auto-prompt once per visit when device unlock is available.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional single mount prompt
  }, [passkeyPrimary, recoveryMode, resetConfirm]);

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
              body="Old private messages stay sealed forever. Other devices need this new recovery code. New DMs open after you save it."
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
      ) : passkeyPrimary && !recoveryMode ? (
        <div className="messages-unlock-form">
          {compact ? (
            <p className="messages-unlock-title">
              Unlock private messages on this device.
            </p>
          ) : null}
          {error ? (
            <p className="dm-compose-error" role="alert">
              {error}
            </p>
          ) : null}
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              ready={!busy}
              pending={passkeyPending}
              pendingLabel="Unlocking…"
              onClick={() => void handlePasskeyUnlock()}
            >
              Unlock with this device
            </OsSheetAction>
            <OsSheetAction
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setError(null);
                setRecoveryMode(true);
              }}
            >
              Use recovery code
            </OsSheetAction>
          </OsSheetActions>
        </div>
      ) : (
        <form
          className="messages-unlock-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleRestore();
          }}
        >
          {compact ? (
            <p className="messages-unlock-title">
              Enter your recovery code to unlock.
            </p>
          ) : null}
          <OsField label="Recovery code" htmlFor={codeInputId}>
            <input
              id={codeInputId}
              className={`${osFieldBorderedClassName} messages-unlock-code-input`}
              value={recoveryInput}
              onChange={(event) => setRecoveryInput(event.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              disabled={busy}
            />
          </OsField>
          {error ? (
            <p className="dm-compose-error" role="alert">
              {error}
            </p>
          ) : null}
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="submit"
              ready={Boolean(recoveryInput.trim()) && !busy}
              pending={unlockPending}
              pendingLabel="Unlocking…"
            >
              Unlock
            </OsSheetAction>
            {passkeyPrimary ? (
              <OsSheetAction
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setRecoveryInput('');
                  setRecoveryMode(false);
                }}
              >
                Back to device unlock
              </OsSheetAction>
            ) : null}
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
        </form>
      )}
    </section>
  );
}
