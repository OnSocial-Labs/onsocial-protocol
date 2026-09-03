'use client';

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import {
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  OsSurfaceRow,
  OsSurfaceRowList,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  getSpendableNearBalance,
  normalizeFtBalanceYocto,
  viewAccount,
  viewNearContract,
} from '@/lib/app-near-rpc';
import {
  formatThankAmount,
  getThankAmountError,
  getThankBalanceError,
  getThankNearError,
  getThankRecipientError,
  isThankStorageRegistered,
  normalizeThankRecipientId,
  normalizeThankRecipientIds,
  parseThankAmountSmallest,
  resolveThankDecimals,
  resolveThankStorageDeposit,
  THANK_TOKEN_RECIPIENT_CAP,
  thankTotalSmallest,
  toggleThankRecipient,
} from '@/lib/app-thank-token';
import { sendThankTokenTransaction } from '@/lib/app-thank-token-transactions';
import { fallbackLabel } from '@/lib/profile-display';
import {
  fetchProfileSocialStandings,
  type StandingAccountSummary,
} from '@/lib/profile-social-standings';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import type { UserCreatedTokenRecord } from '@/lib/user-created-tokens';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

type ThankPhase = 'idle' | 'checking' | 'signing' | 'confirming';

function fieldId(name: string) {
  return `token-thank-${name}`;
}

export function AppThankTokenSheet({
  open,
  token,
  accountId,
  panelStyle,
  onClose,
}: {
  open: boolean;
  token: UserCreatedTokenRecord | null;
  accountId: string;
  panelStyle?: CSSProperties;
  onClose: () => void;
}) {
  const { getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [amount, setAmount] = useState('1');
  const [selected, setSelected] = useState<string[]>([]);
  const [standers, setStanders] = useState<StandingAccountSummary[]>([]);
  const [standersLoading, setStandersLoading] = useState(false);
  const [balanceSmallest, setBalanceSmallest] = useState<bigint | null>(null);
  const [phase, setPhase] = useState<ThankPhase>('idle');
  const [error, setError] = useState<string | null>(null);

  const sheetOpen = open && !closing && Boolean(token);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClosing(false);
      setAmount('1');
      setSelected([]);
      setStanders([]);
      setBalanceSmallest(null);
      setPhase('idle');
      setError(null);
    }
  }

  useEffect(() => {
    if (!open || !token || !accountId) return;
    let cancelled = false;
    setStandersLoading(true);
    void Promise.all([
      fetchProfileSocialStandings(accountId, accountId, 'incoming', 0),
      viewNearContract<unknown>(token.contractId, 'ft_balance_of', {
        account_id: accountId,
      }).catch(() => null),
    ])
      .then(([page, balance]) => {
        if (cancelled) return;
        setStanders(page.accounts);
        if (balance != null) {
          setBalanceSmallest(normalizeFtBalanceYocto(balance));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load people who stand with you.');
        }
      })
      .finally(() => {
        if (!cancelled) setStandersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, open, token]);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const decimals = resolveThankDecimals(token?.decimals);
  const amountError = getThankAmountError(amount, decimals);
  const amountSmallest = parseThankAmountSmallest(amount, decimals);
  const recipients = normalizeThankRecipientIds(selected, accountId);
  const recipientError = getThankRecipientError(selected, accountId);
  const pending = phase !== 'idle';
  const canSubmit =
    Boolean(token) &&
    Boolean(amountSmallest) &&
    !amountError &&
    recipients.length > 0 &&
    !recipientError &&
    !pending;

  const handleToggle = useCallback(
    (standerId: string) => {
      if (pending) return;
      const result = toggleThankRecipient(selected, standerId, accountId);
      setSelected(result.next);
      setError(
        result.blocked
          ? `Thank up to ${THANK_TOKEN_RECIPIENT_CAP} people at a time.`
          : null
      );
    },
    [accountId, pending, selected]
  );

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!token || !canSubmit || !amountSmallest) return;
      setPhase('checking');
      setError(null);
      try {
        const [balanceRaw, bounds, accountView, ...storageRows] =
          await Promise.all([
            viewNearContract<unknown>(token.contractId, 'ft_balance_of', {
              account_id: accountId,
            }),
            viewNearContract<{ min?: string }>(
              token.contractId,
              'storage_balance_bounds',
              {}
            ).catch(() => null),
            viewAccount(accountId),
            ...recipients.map((id) =>
              viewNearContract<unknown>(
                token.contractId,
                'storage_balance_of',
                {
                  account_id: id,
                }
              ).catch(() => null)
            ),
          ]);

        const balance = normalizeFtBalanceYocto(balanceRaw);
        setBalanceSmallest(balance);
        const total = thankTotalSmallest(amountSmallest, recipients.length);
        const balanceError = getThankBalanceError(balance, total, token.symbol);
        if (balanceError) {
          setError(balanceError);
          setPhase('idle');
          return;
        }

        const storageDepositYocto = resolveThankStorageDeposit(
          bounds?.min ?? null
        );
        const plans = recipients.map((id, index) => ({
          accountId: id,
          needsStorage: !isThankStorageRegistered(storageRows[index]),
        }));
        const unregistered = plans.filter((row) => row.needsStorage).length;
        const nearError = getThankNearError(
          BigInt(getSpendableNearBalance(accountView)),
          unregistered,
          storageDepositYocto
        );
        if (nearError) {
          setError(nearError);
          setPhase('idle');
          return;
        }

        setPhase('signing');
        const txHashes = await sendThankTokenTransaction(
          getSigningWallet,
          token.contractId,
          {
            senderId: accountId,
            amountSmallest,
            storageDepositYocto,
            recipients: plans,
          }
        );
        setPhase('confirming');
        const confirmed = await trackTransaction({
          txHashes,
          submittedMessage: txToastConfirming.thankingToken,
          successMessage: txToastSuccess.tokenThanksSent,
          failureMessage: txToastError.tokenThankFailed,
        });
        if (confirmed) {
          requestClose();
        }
      } catch (cause) {
        if (isWalletUserCancellation(cause)) return;
        const message =
          cause instanceof Error
            ? cause.message
            : txToastError.tokenThankFailed;
        setError(message);
        setTxResult({ type: 'error', msg: txToastError.tokenThankFailed });
      } finally {
        setPhase('idle');
      }
    },
    [
      accountId,
      amountSmallest,
      canSubmit,
      getSigningWallet,
      recipients,
      requestClose,
      setTxResult,
      token,
      trackTransaction,
    ]
  );

  if (!token) return null;

  const balanceLabel =
    balanceSmallest == null
      ? null
      : `${formatThankAmount(balanceSmallest.toString(), decimals)} ${token.symbol}`;

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Thank"
      copy={token.symbol}
      closeAriaLabel="Close"
      backdropLabel="Close thank"
      zIndex={SHEET_Z.nestedConfirm}
      panelClassName="account-storage-panel os-sheet-cap-tall"
      {...(panelStyle ? { panelStyle } : {})}
    >
      <form
        className="app-storage-sheet token-create-form"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <p className="app-storage-meta">People who stand with you.</p>

        <label className="guild-field" htmlFor={fieldId('amount')}>
          <span>Each</span>
          <input
            id={fieldId('amount')}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            disabled={pending}
            autoComplete="off"
            className={osFieldBorderedClassName}
          />
          <small>
            {balanceLabel
              ? `${balanceLabel} · same for everyone`
              : 'Same for everyone'}
          </small>
        </label>

        {standersLoading ? (
          <p className="app-storage-meta">Loading…</p>
        ) : standers.length === 0 ? (
          <p className="app-storage-meta">No one stands with you yet.</p>
        ) : (
          <OsSurfaceRowList
            className="token-thank-list"
            aria-label="People who stand with you"
          >
            {standers.map((stander) => {
              const active = recipients.includes(
                normalizeThankRecipientId(stander.accountId)
              );
              return (
                <OsSurfaceRow
                  key={stander.accountId}
                  label={
                    stander.name?.trim() || fallbackLabel(stander.accountId)
                  }
                  description={stander.accountId}
                  leading={
                    <AccountAvatar
                      accountId={stander.accountId}
                      kind={stander.kind}
                      src={stander.avatarUrl}
                      fallbackInitial={(
                        stander.name?.trim() || stander.accountId
                      ).slice(0, 1)}
                      size="sm"
                    />
                  }
                  trailing="none"
                  active={active}
                  disabled={pending}
                  onClick={() => handleToggle(stander.accountId)}
                />
              );
            })}
          </OsSurfaceRowList>
        )}

        {standers.length > 0 ? (
          <p className="app-storage-meta">
            {recipients.length} of {THANK_TOKEN_RECIPIENT_CAP}
          </p>
        ) : null}

        {error || amountError ? (
          <p className="token-create-note is-warn" role="alert">
            {error || amountError}
          </p>
        ) : null}

        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="submit"
            ready={canSubmit}
            pending={pending}
            pendingLabel={
              phase === 'checking'
                ? 'Checking…'
                : phase === 'confirming'
                  ? 'Confirming…'
                  : 'Signing…'
            }
            disabled={!canSubmit}
          >
            {recipients.length > 0 ? `Thank ${recipients.length}` : 'Thank'}
          </OsSheetAction>
        </OsSheetActions>
      </form>
    </OsHugSheet>
  );
}
