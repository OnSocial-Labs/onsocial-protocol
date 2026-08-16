'use client';

import { useState } from 'react';
import {
  OsField,
  OsSheetAction,
  OsSheetActions,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import {
  canOfferDmPasskey,
  hasDmPasskeyEnrolled,
  restoreDmKeysFromRecoveryCode,
  unlockDmKeysWithPasskey,
} from '@/lib/dm/keys';
import { lookupDmKeyBackup } from '@/lib/dm/pubkey';

type DmUnlockPanelProps = {
  accountId: string;
  /** Compact layout for sheets vs Messages page. */
  compact?: boolean;
  onUnlocked: () => void;
};

/**
 * Recovery code + optional passkey unlock. Shared by Messages inbox and compose.
 */
export function DmUnlockPanel({
  accountId,
  compact = false,
  onUnlocked,
}: DmUnlockPanelProps) {
  const { getClient } = useAppOnSocialClient();
  const [recoveryInput, setRecoveryInput] = useState('');
  const [unlockPending, setUnlockPending] = useState(false);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passkeyEnrolled = hasDmPasskeyEnrolled(accountId);
  const canPasskey = canOfferDmPasskey();

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
            ready={!passkeyPending}
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
          disabled={unlockPending || passkeyPending}
        />
      </OsField>
      <OsSheetActions>
        <OsSheetAction
          type="button"
          ready={Boolean(recoveryInput.trim())}
          pending={unlockPending}
          pendingLabel="Unlocking…"
          onClick={() => void handleRestore()}
        >
          Unlock with code
        </OsSheetAction>
      </OsSheetActions>
      {error ? (
        <p className="dm-compose-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
