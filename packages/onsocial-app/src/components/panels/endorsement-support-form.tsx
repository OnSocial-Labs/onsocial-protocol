'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AmountField, AmountFieldMetaRow, TokenIcon } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useSocialTokenIcon } from '@/hooks/use-social-token-icon';
import {
  useSyncCommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { accountIdsEqual } from '@/lib/account-match';
import { finalizeAmountInput } from '@/lib/amount-input';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { formatSocialCompact } from '@/lib/format-social-balance';
import { displayName } from '@/lib/profile-display';
import {
  buildSupportEndorsementTransaction,
  fetchSupportEndorsementRouting,
  isEndorsementSpendTargetId,
  parseSupportEndorsementAmountYocto,
  type SupportEndorsementRoutingDisclosure,
} from '@/lib/social-spend-endorsement';
import {
  clampSocialSpendAmountInput,
  formatSpendAmountHint,
  formatSupportProfileRecipientSharePercent,
  formatSupportProfileTreasurySharePercent,
  formatSupportSplitSocialLabel,
  SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS,
  splitSupportAmountYocto,
  SUPPORT_PROFILE_MIN_YOCTO,
  SUPPORT_PROFILE_PRESET_SOCIAL,
  supportPresetsAtOrAboveMin,
} from '@/lib/social-spend-profile';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

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

interface EndorsementSupportFormProps {
  endorsementId: string;
  recipientAccountId: string;
  recipientName?: string | null;
  issuer: string;
  topic?: string | null;
  formId?: string;
  onFooterStateChange?: (state: CommerceSheetFooterState | null) => void;
  onSuccess?: () => void;
}

export function EndorsementSupportForm({
  endorsementId,
  recipientAccountId,
  recipientName = null,
  issuer,
  topic = null,
  formId,
  onFooterStateChange,
  onSuccess,
}: EndorsementSupportFormProps) {
  const { accountId, isConnected, connect } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const socialIcon = useSocialTokenIcon();
  const [amountInput, setAmountInput] = useState('1');
  const [walletBalanceYocto, setWalletBalanceYocto] = useState<bigint | null>(
    null
  );
  const [routing, setRouting] =
    useState<SupportEndorsementRoutingDisclosure | null>(null);
  const [routingStatus, setRoutingStatus] = useState<RoutingStatus>('loading');
  const [routingRetryKey, setRoutingRetryKey] = useState(0);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const isSelf =
    Boolean(accountId) && accountIdsEqual(accountId!, recipientAccountId);
  const name = displayName(recipientAccountId, recipientName ?? undefined);
  const spendTargetOk = isEndorsementSpendTargetId(endorsementId);
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
      setAmountInput(
        clampSocialSpendAmountInput(raw, {
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
    if (isSelf || !spendTargetOk) {
      setRouting(null);
      setRoutingStatus('loading');
      return;
    }
    let cancelled = false;
    setRoutingStatus('loading');
    setRouting(null);
    void fetchSupportEndorsementRouting()
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
  }, [isSelf, routingRetryKey, spendTargetOk]);

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
      parsedYocto = parseSupportEndorsementAmountYocto(
        normalizedAmount,
        minYocto
      );
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
    spendTargetOk &&
    !isSelf &&
    isConnected &&
    routingActive &&
    !pending &&
    parsedYocto != null &&
    !amountError;

  const footerState = useMemo((): CommerceSheetFooterState | null => {
    if (isSelf) return null;
    return {
      visible: true,
      primaryLabel: isConnected ? 'Support endorsement' : 'Connect wallet',
      primaryPendingLabel: 'Sending…',
      canSubmit: isConnected ? canSubmit : true,
      pending,
      disabled: pending || (isConnected && !canSubmit),
    };
  }, [canSubmit, isConnected, isSelf, pending]);

  useSyncCommerceSheetFooter(footerState, onFooterStateChange);

  async function handleSubmit() {
    setFieldError(null);

    if (!isConnected) {
      await connect();
      return;
    }
    if (!spendTargetOk) {
      setFieldError('This endorsement cannot receive support yet.');
      return;
    }
    if (isSelf) {
      setFieldError('You can’t support your own endorsement target.');
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
      setFieldError('Endorsement support isn’t available right now.');
      return;
    }

    let amountYocto: bigint;
    try {
      amountYocto = parseSupportEndorsementAmountYocto(
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
      const payload = buildSupportEndorsementTransaction(client, {
        endorsementId,
        recipientAccountId,
        amountYocto,
        issuer,
        topic,
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
        submittedMessage: txToastConfirming.supportingEndorsement,
        successMessage: txToastSuccess.endorsementSupportSent(name),
        failureMessage: txToastError.endorsementSupportFailed,
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
          cause instanceof Error
            ? cause.message
            : txToastError.endorsementSupportFailed,
      });
    } finally {
      setPending(false);
    }
  }

  if (!spendTargetOk) {
    return (
      <p className="page-drawer-section-empty">
        This endorsement can’t receive SOCIAL support yet.
      </p>
    );
  }

  if (isSelf) {
    return (
      <p className="page-drawer-section-empty">
        Others can support this vouch with SOCIAL.
      </p>
    );
  }

  return (
    <form
      id={formId}
      className="profile-support-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <AmountField
        value={amountInput}
        onValueChange={applyAmountInput}
        maxDecimals={SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS}
        placeholder={amountHint}
        aria-label="Amount in SOCIAL"
        invalid={Boolean(amountError)}
        unit="SOCIAL"
        unitIcon={<TokenIcon src={socialIcon} label="SOCIAL" />}
        disabled={pending}
      />

      <AmountFieldMetaRow
        tone="support"
        presets={presets}
        selectedValue={normalizedAmount}
        onSelectPreset={applyAmountInput}
        disabled={pending}
        meta={
          walletBalanceYocto != null
            ? `${formatSocialCompact(walletBalanceYocto.toString())} available`
            : null
        }
      />

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
            Endorsement support isn’t available right now.
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
    </form>
  );
}
