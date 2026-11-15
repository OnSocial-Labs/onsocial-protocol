'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
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
import { txToastError, txToastSuccess } from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface AppAccessSheetProps {
  open: boolean;
  accountId: string;
  onClose: () => void;
  pageMoodId?: string | null;
  panelStyle?: CSSProperties;
}

function shortenSessionKey(publicKey: string): string {
  if (publicKey.length <= 22) return publicKey;
  return `${publicKey.slice(0, 14)}…${publicKey.slice(-8)}`;
}

/**
 * Nested account sheet — session key allow / renew / remove.
 * Allow/renew use connect `addFunctionCallKey` (same calm sheet as connect).
 * Button owns wait; toast is success/error only.
 */
export function AppAccessSheet({
  open,
  accountId,
  onClose,
  pageMoodId = null,
  panelStyle,
}: AppAccessSheetProps) {
  const {
    isBootstrappingSession,
    resumeSocialSession,
    clearSocialSessionLocal,
    getSigningWallet,
    connectWithOptions,
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
      const nextLifecycle = await getAppSocialSessionLifecycle(accountId);
      setLifecycle(nextLifecycle);
      if (nextLifecycle === 'active' || nextLifecycle === 'expired') {
        setPublicKey(await getAppSocialSessionPublicKey(accountId));
      } else {
        setPublicKey(null);
      }
    } catch {
      setLifecycle('missing');
      setPublicKey(null);
    } finally {
      setLoadingStatus(false);
    }
  }, [accountId]);

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
    try {
      setPending(true);
      const ready = renewing
        ? await renewAppSocialSession({
            accountId,
            connectWithOptions,
          })
        : await grantAppSocialSession({
            accountId,
            connectWithOptions,
          });

      if (!ready) {
        setTxResult({
          type: 'error',
          msg: txToastError.allowAppAccessFailed,
        });
        return;
      }

      setTxResult({
        type: 'success',
        msg: renewing
          ? txToastSuccess.appAccessRenewed
          : txToastSuccess.appAccessAllowed,
      });
      await resumeSocialSession({
        renewIfExpired: false,
        bootstrapIfMissing: false,
      });
      await refreshStatus();
    } catch (error) {
      if (isWalletUserCancellation(error)) {
        setTxResult(null);
        return;
      }
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
    accountId,
    connectWithOptions,
    isBootstrappingSession,
    lifecycle,
    pending,
    refreshStatus,
    resumeSocialSession,
    setTxResult,
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
        successMessage: txToastSuccess.appAccessRemoved,
        failureMessage: txToastError.removeAppAccessFailed,
      });
      if (!confirmed) return;

      await clearAppSocialSession(signerId);
      clearSocialSessionLocal();
      setPublicKey(null);
      setLifecycle('missing');
      setConfirmRemove(false);
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

  const accessActive = lifecycle === 'active';
  const accessExpired = lifecycle === 'expired';
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
      ? 'Session expired. Renew keeps the same key on this device, or remove access.'
      : 'Allow access adds the same session key as connect — post, stand, and collect without a wallet prompt each time.';
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
      zIndex={SHEET_Z.nested}
      titleId="app-access-sheet-title"
      headerClassName="account-storage-header"
      panelClassName={`account-storage-panel os-sheet-cap-standard${pageMoodId ? ' account-storage-panel--page-mood' : ''}`}
      {...(panelStyle ? { panelStyle } : {})}
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
