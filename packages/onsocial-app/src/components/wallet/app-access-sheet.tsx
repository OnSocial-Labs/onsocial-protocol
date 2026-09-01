'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  standingIdentityAccountCopy,
} from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  clearAppSocialSession,
  getAppSocialSessionLifecycle,
  getAppSocialSessionPublicKey,
  grantAppSocialSession,
  renewAppSocialSession,
  revokeAppSocialSession,
  type AppSocialSessionLifecycle,
} from '@/lib/app-social-session';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface AppAccessSheetProps {
  open: boolean;
  accountId: string;
  onClose: () => void;
}

function shortenSessionKey(publicKey: string): string {
  if (publicKey.length <= 22) return publicKey;
  return `${publicKey.slice(0, 14)}…${publicKey.slice(-8)}`;
}

/**
 * Nested account sheet — OnSocial session key status + allow / renew / remove.
 * Log out stays separate (disconnect only); this owns on-chain DeleteKey.
 * Expired renew reuses the same FunctionCall key (no orphan AddKey).
 */
export function AppAccessSheet({
  open,
  accountId,
  onClose,
}: AppAccessSheetProps) {
  const {
    hasSocialSession,
    isBootstrappingSession,
    resumeSocialSession,
    clearSocialSessionLocal,
    getSigningWallet,
  } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [closing, setClosing] = useState(false);
  const [lifecycle, setLifecycle] =
    useState<AppSocialSessionLifecycle>('missing');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const sheetOpen = open && !closing;

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const nextLifecycle = hasSocialSession
        ? 'active'
        : await getAppSocialSessionLifecycle(accountId);
      setLifecycle(nextLifecycle);
      if (nextLifecycle === 'active' || nextLifecycle === 'expired') {
        setPublicKey(await getAppSocialSessionPublicKey(accountId));
      } else {
        setPublicKey(null);
      }
    } catch {
      setLifecycle(hasSocialSession ? 'active' : 'missing');
      setPublicKey(null);
    } finally {
      setLoadingStatus(false);
    }
  }, [accountId, hasSocialSession]);

  useEffect(() => {
    if (!sheetOpen) {
      setConfirmRemove(false);
      setPending(false);
      setPublicKey(null);
      return;
    }
    void refreshStatus();
  }, [refreshStatus, sheetOpen]);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    setConfirmRemove(false);
    onClose();
  }, [onClose]);

  const handleAllowOrRenew = useCallback(async () => {
    if (pending || isBootstrappingSession) return;
    const renewing = lifecycle === 'expired';
    setPending(true);
    try {
      const { wallet, accountId: signerId } = await getSigningWallet();
      const result = renewing
        ? await renewAppSocialSession({
            accountId: signerId,
            wallet,
          })
        : await grantAppSocialSession({
            accountId: signerId,
            wallet,
          });

      if (!result.ready) {
        setTxResult({
          type: 'error',
          msg: txToastError.allowAppAccessFailed,
        });
        return;
      }

      const confirmed = await trackTransaction({
        txHashes: result.txHashes,
        submittedMessage: renewing
          ? txToastConfirming.renewingAppAccess
          : txToastConfirming.allowingAppAccess,
        successMessage: renewing
          ? txToastSuccess.appAccessRenewed
          : txToastSuccess.appAccessAllowed,
        failureMessage: txToastError.allowAppAccessFailed,
      });
      if (!confirmed) {
        // Bootstrap already wrote local metadata; drop it if chain failed.
        await clearAppSocialSession(signerId);
        clearSocialSessionLocal();
        await refreshStatus();
        return;
      }

      // Sync React session flag from local store (no second wallet prompt).
      await resumeSocialSession({
        renewIfExpired: false,
        bootstrapIfMissing: false,
      });
      await refreshStatus();
    } catch (error) {
      if (isWalletUserCancellation(error)) return;
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error
            ? error.message
            : txToastError.allowAppAccessFailed,
      });
    } finally {
      setPending(false);
    }
  }, [
    clearSocialSessionLocal,
    getSigningWallet,
    isBootstrappingSession,
    lifecycle,
    pending,
    refreshStatus,
    resumeSocialSession,
    setTxResult,
    trackTransaction,
  ]);

  const handleRemove = useCallback(async () => {
    if (pending) return;
    setPending(true);
    try {
      const { wallet, accountId: signerId } = await getSigningWallet();
      const txHashes = await revokeAppSocialSession({
        accountId: signerId,
        wallet,
      });

      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.removingAppAccess,
        successMessage: txToastSuccess.appAccessRemoved,
        failureMessage: txToastError.removeAppAccessFailed,
      });

      // Local store is cleared by revoke; always drop React flags after submit.
      clearSocialSessionLocal();
      setPublicKey(null);
      setLifecycle('missing');
      setConfirmRemove(false);
      if (!confirmed) return;
    } catch (error) {
      if (isWalletUserCancellation(error)) return;
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error
            ? error.message
            : txToastError.removeAppAccessFailed,
      });
    } finally {
      setPending(false);
    }
  }, [
    clearSocialSessionLocal,
    getSigningWallet,
    pending,
    setTxResult,
    trackTransaction,
  ]);

  const accessActive = lifecycle === 'active' || hasSocialSession;
  const accessExpired = !accessActive && lifecycle === 'expired';
  const statusLabel = loadingStatus
    ? 'Checking…'
    : accessActive
      ? 'Active'
      : accessExpired
        ? 'Expired'
        : 'Not allowed';
  const statusHint = accessActive
    ? 'Lets OnSocial act for you without opening the wallet every time.'
    : accessExpired
      ? 'Session expired. Renew to keep the same key, or remove access.'
      : 'Allow access so OnSocial can post, stand, and collect without a wallet prompt each time.';
  const pillClass = accessActive
    ? ' is-active'
    : accessExpired
      ? ' is-expired'
      : '';

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="App access"
      copy={standingIdentityAccountCopy(accountId)}
      closeAriaLabel="Close app access"
      backdropLabel="Close app access"
      zIndex={SHEET_Z.facts}
      titleId="app-access-sheet-title"
      headerClassName="account-storage-header"
      panelClassName="account-storage-panel os-sheet-cap-standard"
    >
      <div className="app-storage-sheet">
        <section className="app-storage-readout os-surface-panel">
          <div className="app-storage-readout-head">
            <span className="account-wallet-metric-label">Session key</span>
            <span className={`app-access-status-pill${pillClass}`}>
              {statusLabel}
            </span>
          </div>
          <p className="app-storage-meta">{statusHint}</p>
          {publicKey ? (
            <p className="app-access-status-key" title={publicKey}>
              {shortenSessionKey(publicKey)}
            </p>
          ) : null}
        </section>

        {(accessActive || accessExpired) && confirmRemove ? (
          <p className="app-storage-hint app-storage-hint--compact">
            Your wallet will ask to delete this OnSocial session key.
          </p>
        ) : null}

        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          {accessActive || accessExpired ? (
            confirmRemove ? (
              <>
                <OsSheetAction
                  type="button"
                  variant="danger"
                  ready={!pending}
                  pending={pending}
                  pendingLabel="Removing…"
                  onClick={() => void handleRemove()}
                >
                  Remove access
                </OsSheetAction>
                <OsSheetAction
                  type="button"
                  variant="ghost"
                  ready={!pending}
                  disabled={pending}
                  onClick={() => setConfirmRemove(false)}
                >
                  Cancel
                </OsSheetAction>
              </>
            ) : (
              <>
                {accessExpired ? (
                  <OsSheetAction
                    type="button"
                    variant="primary"
                    ready={!pending && !isBootstrappingSession}
                    pending={pending || isBootstrappingSession}
                    pendingLabel="Renewing…"
                    onClick={() => void handleAllowOrRenew()}
                  >
                    Renew access
                  </OsSheetAction>
                ) : null}
                <OsSheetAction
                  type="button"
                  variant="danger"
                  ready={!pending}
                  onClick={() => setConfirmRemove(true)}
                >
                  Remove access
                </OsSheetAction>
              </>
            )
          ) : (
            <OsSheetAction
              type="button"
              variant="primary"
              ready={!pending && !isBootstrappingSession}
              pending={pending || isBootstrappingSession}
              pendingLabel="Allowing…"
              onClick={() => void handleAllowOrRenew()}
            >
              Allow access
            </OsSheetAction>
          )}
        </OsSheetActions>
      </div>
    </OsHugSheet>
  );
}
