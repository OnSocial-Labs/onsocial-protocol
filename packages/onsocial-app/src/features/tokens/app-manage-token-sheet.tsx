'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react';
import {
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  OsSurfaceRow,
  OsSurfaceRowList,
  TokenIcon,
} from '@onsocial/ui';
import { AppThankTokenSheet } from '@/features/tokens/app-thank-token-sheet';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/app-config';
import {
  FT_ICON_ACCEPT,
  getFtIconError,
  isFtAdminFor,
} from '@/lib/app-create-token';
import {
  sendRenounceTokenOwnerTransaction,
  sendSetTokenIconTransaction,
} from '@/lib/app-create-token-transactions';
import { viewNearContract } from '@/lib/app-near-rpc';
import { prepareFtIconPngDataUrl } from '@/lib/prepare-ft-icon-png';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import {
  patchUserCreatedToken,
  type UserCreatedTokenRecord,
} from '@/lib/user-created-tokens';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export function AppManageTokenSheet({
  open,
  token,
  accountId,
  panelStyle,
  onClose,
  onChanged,
}: {
  open: boolean;
  token: UserCreatedTokenRecord | null;
  accountId: string;
  panelStyle?: CSSProperties;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [icon, setIcon] = useState(token?.icon ?? '');
  const [canAdmin, setCanAdmin] = useState(!token?.renounced);
  const [pending, setPending] = useState<'icon' | 'lock' | null>(null);
  const [thankOpen, setThankOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  const sheetOpen = open && !closing && Boolean(token);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClosing(false);
      setIcon(token?.icon ?? '');
      setCanAdmin(!token?.renounced);
      setPending(null);
      setThankOpen(false);
      setError(null);
    }
  }

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    void viewNearContract<string>(token.contractId, 'get_owner', {})
      .then((owner) => {
        if (cancelled) return;
        const admin = isFtAdminFor(owner, accountId);
        setCanAdmin(admin);
        if (!admin) {
          patchUserCreatedToken(accountId, token.contractId, {
            renounced: true,
          });
        }
      })
      .catch(() => {
        // Keep the local ledger if the view is not up yet.
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, open, token]);

  const requestClose = useCallback(() => {
    setThankOpen(false);
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const handleIconChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file || !token || !canAdmin) return;
      try {
        const dataUrl = await prepareFtIconPngDataUrl(file);
        const iconError = getFtIconError(dataUrl);
        if (iconError) {
          setError(iconError);
          return;
        }
        setPending('icon');
        setError(null);
        const txHashes = await sendSetTokenIconTransaction(
          getSigningWallet,
          token.contractId,
          dataUrl
        );
        const confirmed = await trackTransaction({
          txHashes,
          submittedMessage: txToastConfirming.savingTokenIcon,
          successMessage: txToastSuccess.tokenIconUpdated,
          failureMessage: txToastError.tokenIconFailed,
        });
        if (confirmed) {
          setIcon(dataUrl);
          patchUserCreatedToken(accountId, token.contractId, { icon: dataUrl });
          onChanged?.();
        }
      } catch (cause) {
        if (isWalletUserCancellation(cause)) return;
        const message =
          cause instanceof Error ? cause.message : txToastError.tokenIconFailed;
        setError(message);
        setTxResult({ type: 'error', msg: txToastError.tokenIconFailed });
      } finally {
        setPending(null);
      }
    },
    [
      accountId,
      canAdmin,
      getSigningWallet,
      onChanged,
      setTxResult,
      token,
      trackTransaction,
    ]
  );

  const handleLock = useCallback(async () => {
    if (!token || !canAdmin) return;
    setPending('lock');
    setError(null);
    try {
      const txHashes = await sendRenounceTokenOwnerTransaction(
        getSigningWallet,
        token.contractId
      );
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.lockingTokenAdmin,
        successMessage: txToastSuccess.tokenAdminLocked,
        failureMessage: txToastError.tokenLockFailed,
      });
      if (confirmed) {
        setCanAdmin(false);
        patchUserCreatedToken(accountId, token.contractId, { renounced: true });
        onChanged?.();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      const message =
        cause instanceof Error ? cause.message : txToastError.tokenLockFailed;
      setError(message);
      setTxResult({ type: 'error', msg: txToastError.tokenLockFailed });
    } finally {
      setPending(null);
    }
  }, [
    accountId,
    canAdmin,
    getSigningWallet,
    onChanged,
    setTxResult,
    token,
    trackTransaction,
  ]);

  if (!token) return null;

  return (
    <>
      <OsHugSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        label={token.name}
        copy={token.symbol}
        closeAriaLabel="Close"
        backdropLabel="Close token"
        zIndex={SHEET_Z.nested}
        panelClassName="account-storage-panel os-sheet-cap-standard"
        {...(panelStyle ? { panelStyle } : {})}
      >
        <div className="app-storage-sheet token-create-form">
          <div className="token-create-name-row">
            <button
              type="button"
              className="token-create-icon-pick"
              disabled={!canAdmin || pending !== null}
              aria-label={canAdmin ? 'Choose icon' : 'Icon locked'}
              onClick={() => iconInputRef.current?.click()}
            >
              <TokenIcon
                src={icon || token.icon}
                label={token.symbol}
                size="md"
              />
            </button>
            <input
              ref={iconInputRef}
              type="file"
              accept={FT_ICON_ACCEPT}
              className="token-create-icon-input"
              tabIndex={-1}
              aria-hidden
              disabled={!canAdmin || pending !== null}
              onChange={(event) => void handleIconChange(event)}
            />
            <p className="app-storage-meta token-manage-id">
              {token.contractId}
            </p>
          </div>

          {canAdmin ? null : (
            <p className="app-storage-meta">Admin is locked.</p>
          )}

          {error ? (
            <p className="token-create-note is-warn" role="alert">
              {error}
            </p>
          ) : null}

          <OsSurfaceRowList aria-label="Token">
            <OsSurfaceRow
              label="Thank"
              description="People who stand with you"
              trailing="navigate"
              disabled={pending !== null}
              onClick={() => setThankOpen(true)}
            />
            <OsSurfaceRow
              label="Nearblocks"
              description={token.contractId}
              href={`${ACTIVE_NEAR_EXPLORER_URL}/address/${token.contractId}`}
              external
              trailing="external"
            />
          </OsSurfaceRowList>

          {canAdmin ? (
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="button"
                ready={pending === null}
                pending={pending === 'lock'}
                pendingLabel="Signing…"
                disabled={pending !== null}
                onClick={() => void handleLock()}
              >
                Lock admin
              </OsSheetAction>
            </OsSheetActions>
          ) : null}
        </div>
      </OsHugSheet>

      <AppThankTokenSheet
        open={thankOpen && open}
        token={token}
        accountId={accountId}
        panelStyle={panelStyle}
        onClose={() => setThankOpen(false)}
      />
    </>
  );
}
