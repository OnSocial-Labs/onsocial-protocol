'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { TokenIcon } from '@/components/ui/token-icon';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useSocialTokenIcon } from '@/hooks/use-social-token-icon';
import { accountIdsEqual } from '@/lib/account-match';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { formatSocialCompact } from '@/lib/format-social-balance';
import { displayName } from '@/lib/profile-display';
import {
  clampSocialSpendAmountInput,
  fetchSupportProfileRouting,
  formatSpendAmountHint,
  formatSupportProfileRecipientSharePercent,
  formatSupportProfileTreasurySharePercent,
  formatSupportSplitSocialLabel,
  parseSupportAmountYocto,
  SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS,
  splitSupportAmountYocto,
  SUPPORT_PROFILE_MIN_YOCTO,
  SUPPORT_PROFILE_PRESET_SOCIAL,
  supportPresetsAtOrAboveMin,
  type SupportProfileRoutingDisclosure,
} from '@/lib/social-spend-profile';
import {
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const APP_SOCIAL_SPEND_APP_ID = 'onpage';

type RoutingStatus = 'loading' | 'ready' | 'error';

function extractTxHash(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  if (typeof obj.txHash === 'string') return obj.txHash;
  if (typeof obj.hash === 'string') return obj.hash;

  const transaction = obj.transaction;
  if (transaction && typeof transaction === 'object') {
    const hash = (transaction as Record<string, unknown>).hash;
    if (typeof hash === 'string') return hash;
  }

  const raw = obj.raw;
  if (raw && raw !== value) return extractTxHash(raw);

  return undefined;
}

interface ProfileSupportFormProps {
  pageAccountId: string;
  profileName?: string | null;
  /** Called after a confirmed support spend (sheet can close). */
  onSuccess?: () => void;
}

async function fetchWalletBalanceYocto(accountId: string): Promise<bigint> {
  const response = await fetch(
    `/api/token/balance?accountId=${encodeURIComponent(accountId)}`,
    { cache: 'no-store' }
  );
  const body = (await response.json().catch(() => null)) as {
    balanceYocto?: string;
  } | null;
  if (!response.ok || !body?.balanceYocto) {
    throw new Error('Could not load SOCIAL balance.');
  }
  return BigInt(body.balanceYocto);
}

export function ProfileSupportForm({
  pageAccountId,
  profileName = null,
  onSuccess,
}: ProfileSupportFormProps) {
  const { accountId, isConnected, connect } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const socialIcon = useSocialTokenIcon();
  const [amountInput, setAmountInput] = useState('1');
  const [walletBalanceYocto, setWalletBalanceYocto] = useState<bigint | null>(
    null
  );
  const [routing, setRouting] =
    useState<SupportProfileRoutingDisclosure | null>(null);
  const [routingStatus, setRoutingStatus] = useState<RoutingStatus>('loading');
  const [routingRetryKey, setRoutingRetryKey] = useState(0);
  const [pending, setPending] = useState(false);
  /** Field / pre-submit validation only — chain failures go to the global toast. */
  const [fieldError, setFieldError] = useState<string | null>(null);

  const isSelf =
    Boolean(accountId) && accountIdsEqual(accountId!, pageAccountId);
  const name = displayName(pageAccountId, profileName ?? undefined);
  /** Live min when ready; soft fallback only for typing before chain answers. */
  const minYocto = routing?.minAmountYocto ?? SUPPORT_PROFILE_MIN_YOCTO;
  const amountHint = formatSpendAmountHint(minYocto);
  const presets = useMemo(
    () => supportPresetsAtOrAboveMin(minYocto, SUPPORT_PROFILE_PRESET_SOCIAL),
    [minYocto]
  );
  const routingReady = routingStatus === 'ready' && routing != null;
  const routingActive = routingReady && routing.active;

  const applyAmountInput = useCallback(
    (raw: string) => {
      const normalized = normalizeAmountInput(
        raw,
        SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS
      );
      setAmountInput(
        clampSocialSpendAmountInput(normalized, {
          balanceYocto: walletBalanceYocto,
        })
      );
    },
    [walletBalanceYocto]
  );

  const retryRouting = useCallback(() => {
    setRoutingRetryKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (isSelf) {
      setRouting(null);
      setRoutingStatus('loading');
      return;
    }
    let cancelled = false;
    setRoutingStatus('loading');
    setRouting(null);
    void fetchSupportProfileRouting()
      .then((next) => {
        if (cancelled) return;
        if (!next) {
          setRouting(null);
          setRoutingStatus('error');
          return;
        }
        setRouting(next);
        setRoutingStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setRouting(null);
        setRoutingStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [isSelf, routingRetryKey]);

  useEffect(() => {
    if (!isConnected || !accountId || isSelf) {
      setWalletBalanceYocto(null);
      return;
    }
    let cancelled = false;
    void fetchWalletBalanceYocto(accountId)
      .then((balance) => {
        if (!cancelled) setWalletBalanceYocto(balance);
      })
      .catch(() => {
        if (!cancelled) setWalletBalanceYocto(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, isConnected, isSelf]);

  const normalizedAmount = finalizeAmountInput(
    amountInput,
    SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS
  );

  let parsedYocto: bigint | null = null;
  let amountError: string | null = null;
  if (normalizedAmount) {
    try {
      parsedYocto = parseSupportAmountYocto(normalizedAmount, minYocto);
      if (walletBalanceYocto != null && parsedYocto > walletBalanceYocto) {
        amountError = 'Not enough SOCIAL in your wallet.';
      }
    } catch (cause) {
      amountError =
        cause instanceof Error ? cause.message : 'Invalid amount.';
    }
  }

  const outcomeSplit =
    routingActive && parsedYocto != null && !amountError
      ? splitSupportAmountYocto(
          parsedYocto,
          routing.targetBps,
          routing.treasuryBps
        )
      : null;

  const canSubmit =
    !isSelf &&
    isConnected &&
    routingActive &&
    !pending &&
    parsedYocto != null &&
    !amountError;

  async function handleSubmit() {
    setFieldError(null);

    if (!isConnected) {
      await connect();
      return;
    }
    if (isSelf) {
      setFieldError('You can’t support yourself.');
      return;
    }
    if (routingStatus === 'loading') {
      setFieldError('Loading split…');
      return;
    }
    if (!routingReady || !routing) {
      setFieldError('Couldn’t load split. Retry and try again.');
      return;
    }
    if (!routing.active) {
      setFieldError('Support isn’t available right now.');
      return;
    }

    let amountYocto: bigint;
    try {
      amountYocto = parseSupportAmountYocto(
        finalizeAmountInput(amountInput, SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS),
        routing.minAmountYocto
      );
    } catch (cause) {
      setFieldError(cause instanceof Error ? cause.message : 'Invalid amount.');
      return;
    }

    if (walletBalanceYocto != null && amountYocto > walletBalanceYocto) {
      setFieldError('Not enough SOCIAL in your wallet.');
      return;
    }

    setPending(true);
    try {
      const { client, accountId: signingAccountId, wallet } = await getClient();
      const payload = client.socialSpend.buildSpendTransaction({
        amount: amountYocto.toString(),
        appId: APP_SOCIAL_SPEND_APP_ID,
        action: 'support_profile',
        targetType: 'profile',
        targetId: pageAccountId,
      });
      const payment = await wallet.signAndSendTransaction({
        network: ACTIVE_NEAR_NETWORK,
        signerId: signingAccountId,
        receiverId: payload.receiverId,
        actions: payload.actions.map((action) => ({
          type: 'FunctionCall' as const,
          params: {
            methodName: action.methodName,
            args: action.args,
            gas: action.gas,
            deposit: action.deposit,
          },
        })),
      });
      const txHash = extractTxHash(payment);
      const confirmed = await trackTransaction({
        txHashes: txHash ? [txHash] : [],
        successMessage: txToastSuccess.supportSent(name),
        failureMessage: txToastError.supportFailed,
      });
      if (confirmed) {
        setAmountInput('1');
        const balance = await fetchWalletBalanceYocto(signingAccountId).catch(
          () => null
        );
        if (balance != null) setWalletBalanceYocto(balance);
        onSuccess?.();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error ? cause.message : txToastError.supportFailed,
      });
    } finally {
      setPending(false);
    }
  }

  if (isSelf) {
    return (
      <p className="page-drawer-section-empty">
        Support from others will show here.
      </p>
    );
  }

  return (
    <form
      className="profile-support-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="app-storage-amount-field profile-support-amount-field">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={amountInput}
          onChange={(event) => applyAmountInput(event.target.value)}
          onBlur={() =>
            applyAmountInput(
              finalizeAmountInput(
                amountInput,
                SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS
              )
            )
          }
          placeholder={amountHint}
          aria-label="Amount in SOCIAL"
          aria-invalid={Boolean(amountError)}
          className="app-storage-amount-input"
          disabled={pending}
        />
        <span className="account-card-balance-unit profile-support-token-unit">
          <TokenIcon src={socialIcon} label="SOCIAL" />
          SOCIAL
        </span>
      </div>

      <div className="profile-support-quick-row">
        <div
          className="app-storage-presets profile-support-presets"
          role="group"
          aria-label="Quick amounts"
        >
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`os-surface-chip${
                normalizedAmount === preset ? ' is-selected' : ''
              }`}
              disabled={pending}
              onClick={() => applyAmountInput(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
        {walletBalanceYocto != null ? (
          <p className="profile-support-balance">
            {formatSocialCompact(walletBalanceYocto.toString())} available
          </p>
        ) : null}
      </div>

      <div className="profile-support-outcome">
        {routingActive && outcomeSplit ? (
          <p className="profile-support-routing">
            {formatSupportSplitSocialLabel(outcomeSplit.recipientYocto)} to them
            <span aria-hidden> · </span>
            {formatSupportSplitSocialLabel(outcomeSplit.treasuryYocto)} protocol
            boost
          </p>
        ) : routingActive && routing ? (
          <p className="profile-support-routing">
            {formatSupportProfileRecipientSharePercent(routing.targetBps)}% to
            them
            <span aria-hidden> · </span>
            {formatSupportProfileTreasurySharePercent(routing.treasuryBps)}%
            protocol boost
          </p>
        ) : routingStatus === 'loading' ? (
          <p className="profile-support-routing is-loading">Loading split…</p>
        ) : routingStatus === 'error' ? (
          <p className="profile-support-routing is-error">
            Couldn’t load split
            <span aria-hidden> · </span>
            <button
              type="button"
              className="profile-support-retry"
              onClick={retryRouting}
            >
              Retry
            </button>
          </p>
        ) : routingReady && !routing.active ? (
          <p className="profile-support-routing is-error">
            Support isn’t available right now.
          </p>
        ) : null}
      </div>

      {fieldError || amountError ? (
        <p className="profile-support-error" role="alert">
          {fieldError ?? amountError}
        </p>
      ) : !isConnected ? (
        <p className="profile-support-hint">Connect to send SOCIAL.</p>
      ) : null}

      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type="submit"
          ready={isConnected ? canSubmit : true}
          pending={pending}
          pendingLabel="Sending…"
          disabled={pending || (isConnected && !canSubmit)}
        >
          {isConnected ? 'Support' : 'Connect wallet'}
        </OsSheetAction>
      </OsSheetActions>
    </form>
  );
}
