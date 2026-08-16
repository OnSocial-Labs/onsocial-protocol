'use client';

import { useState } from 'react';
import {
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
 * Includes a confirm-gated reset for total recovery loss.
 */
export function DmUnlockPanel({
  accountId,
  compact = false,
  onUnlocked,
  onReset,
}: DmUnlockPanelProps) {
  const { getClient } = useAppOnSocialClient();
  const { hasSocialSession } = useAppWallet();
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
      <p>
        {passkeyEnrolled
          ? 'Unlock private messages on this device to continue.'
          : 'Enter your recovery code to unlock private messages on this device.'}
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
      <OsSheetActions>
        <OsSheetAction
          type="button"
          ready={Boolean(recoveryInput.trim()) && !busy}
          pending={unlockPending}
          pendingLabel="Unlocking…"
          onClick={() => void handleRestore()}
        >
          Unlock with code
        </OsSheetAction>
      </OsSheetActions>

      {!resetConfirm ? (
        <button
          type="button"
          className="messages-unlock-reset-link"
          disabled={busy}
          onClick={() => {
            setError(null);
            setResetConfirm(true);
          }}
        >
          Lost your recovery code?
        </button>
      ) : (
        <div className="messages-unlock-reset" role="group" aria-label="Reset messaging keys">
          <p>
            Reset creates new messaging keys and abandons old private messages
            forever. People can still message you — only new ones will open.
            Save the new recovery code when it appears.
          </p>
          <OsSheetActions layout="stack">
            <OsSheetAction
              type="button"
              variant="danger"
              ready={!busy}
              pending={resetPending}
              pendingLabel="Resetting…"
              onClick={() => void handleReset()}
            >
              Reset messaging keys
            </OsSheetAction>
            <OsSheetAction
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setResetConfirm(false)}
            >
              Keep trying recovery
            </OsSheetAction>
          </OsSheetActions>
        </div>
      )}

      {error ? (
        <p className="dm-compose-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
