'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { postContentPath, type PostRow } from '@onsocial/sdk';
import {
  OsSheetAction,
  OsSheetActions,
  TokenIcon,
} from '@onsocial/ui';
import { AmountField } from '@onsocial/ui';
import { AmountFieldMetaRow } from '@/components/ui/amount-field-meta-row';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useSocialTokenIcon } from '@/hooks/use-social-token-icon';
import { accountIdsEqual } from '@/lib/account-match';
import { finalizeAmountInput } from '@/lib/amount-input';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { formatSocialCompact } from '@/lib/format-social-balance';
import { displayName } from '@/lib/profile-display';
import {
  BOOST_POST_MIN_YOCTO,
  BOOST_POST_PRESET_SOCIAL,
  clampSocialSpendAmountInput,
  fetchBoostPostRouting,
  formatSpendAmountHint,
  formatSupportProfileRecipientSharePercent,
  formatSupportProfileTreasurySharePercent,
  formatSupportSplitSocialLabel,
  parseSupportAmountYocto,
  SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS,
  splitSupportAmountYocto,
  supportPresetsAtOrAboveMin,
  type SupportProfileRoutingDisclosure,
} from '@/lib/social-spend-profile';
import {
  txToastConfirming,
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

export interface PostAmplifySuccessDetail {
  amountYocto: bigint;
  isSelf: boolean;
}

interface PostAmplifyFormProps {
  post: PostRow;
  authorName?: string | null;
  onSuccess?: (detail: PostAmplifySuccessDetail) => void;
}

export function PostAmplifyForm({
  post,
  authorName = null,
  onSuccess,
}: PostAmplifyFormProps) {
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
  const [fieldError, setFieldError] = useState<string | null>(null);

  const isSelf =
    Boolean(accountId) && accountIdsEqual(accountId!, post.accountId);
  const name = displayName(post.accountId, authorName ?? undefined);
  const minYocto = routing?.minAmountYocto ?? BOOST_POST_MIN_YOCTO;
  const amountHint = formatSpendAmountHint(minYocto);
  const presets = useMemo(
    () => supportPresetsAtOrAboveMin(minYocto, BOOST_POST_PRESET_SOCIAL),
    [minYocto]
  );
  const routingReady = routingStatus === 'ready' && routing != null;
  const routingActive = routingReady && routing.active;
  const postPath = postContentPath(post);

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
    let cancelled = false;
    setRoutingStatus('loading');
    setRouting(null);
    void fetchBoostPostRouting()
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
  }, [routingRetryKey]);

  useEffect(() => {
    if (!isConnected || !accountId) {
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
  }, [accountId, isConnected]);

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
      amountError = cause instanceof Error ? cause.message : 'Invalid amount.';
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
    if (routingStatus === 'loading') {
      setFieldError('Loading split…');
      return;
    }
    if (!routingReady || !routing) {
      setFieldError('Couldn’t load split. Retry and try again.');
      return;
    }
    if (!routing.active) {
      setFieldError('Amplify isn’t available right now.');
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
      const payload = client.socialSpend.buildBoostPostTransaction(
        {
          postPath,
          authorAccountId: post.accountId,
          amount: amountYocto.toString(),
        },
        { appId: APP_SOCIAL_SPEND_APP_ID }
      );
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
        submittedMessage: txToastConfirming.amplifyingPost,
        successMessage: txToastSuccess.postAmplified,
        failureMessage: txToastError.amplifyFailed,
      });
      if (confirmed) {
        setAmountInput('1');
        const balance = await fetchWalletBalanceYocto(signingAccountId).catch(
          () => null
        );
        if (balance != null) setWalletBalanceYocto(balance);
        onSuccess?.({
          amountYocto,
          isSelf: Boolean(accountIdsEqual(signingAccountId, post.accountId)),
        });
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error ? cause.message : txToastError.amplifyFailed,
      });
    } finally {
      setPending(false);
    }
  }

  const recipientLabel = isSelf ? 'you' : 'author';

  return (
    <form
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
            {formatSupportSplitSocialLabel(outcomeSplit.recipientYocto)} to{' '}
            {recipientLabel}
            <span aria-hidden> · </span>
            {formatSupportSplitSocialLabel(outcomeSplit.treasuryYocto)} protocol
          </p>
        ) : routingActive && routing ? (
          <p className="profile-support-routing">
            {formatSupportProfileRecipientSharePercent(routing.targetBps)}% to{' '}
            {isSelf ? 'you' : name}
            <span aria-hidden> · </span>
            {formatSupportProfileTreasurySharePercent(routing.treasuryBps)}%
            protocol
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
            Amplify isn’t available right now.
          </p>
        ) : null}
      </div>

      {fieldError || amountError ? (
        <p className="profile-support-error" role="alert">
          {fieldError ?? amountError}
        </p>
      ) : !isConnected ? (
        <p className="profile-support-hint">Connect to amplify with SOCIAL.</p>
      ) : null}

      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type="submit"
          ready={isConnected ? canSubmit : true}
          pending={pending}
          pendingLabel="Amplifying…"
          disabled={pending || (isConnected && !canSubmit)}
        >
          {isConnected ? 'Amplify' : 'Connect wallet'}
        </OsSheetAction>
      </OsSheetActions>
    </form>
  );
}
