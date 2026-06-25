'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import {
  SocialSpendAmountForm,
  socialSpendModalBodyClass,
  socialSpendModalShellClass,
} from '@/components/social-spend-amount-form';
import {
  SocialSpendEndorsementIdentity,
  SocialSpendModalHeader,
  SocialSpendRoutingCaption,
} from '@/components/social-spend-modal-chrome';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import { useWallet } from '@/contexts/wallet-context';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import { finalizeAmountInput } from '@/lib/amount-input';
import {
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { getSocialWalletBalanceYocto } from '@/lib/near-rpc';
import {
  formatSupportProfileRecipientSharePercent,
  formatSupportProfileTreasurySharePercent,
  supportPresetsAtOrAboveMin,
  SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS,
  SUPPORT_PROFILE_MIN_YOCTO,
  SUPPORT_PROFILE_PRESET_SOCIAL,
} from '@/lib/social-spend-profile';
import {
  fetchSupportEndorsementRouting,
  parseSupportAmountYocto,
  type EndorsementSupportSubmitInput,
  type SupportEndorsementRoutingDisclosure,
} from '@/lib/social-spend-endorsement';
import {
  isWalletUserCancellation,
  reportWalletActionFailure,
} from '@/lib/wallet-errors';
import { humanizeEndorsementTopic } from '@/lib/endorsements';

interface EndorsementSupportModalProps {
  open: boolean;
  endorsementId: string;
  recipientAccountId: string;
  recipientDisplayName: string;
  issuer: string;
  issuerName?: string | null;
  targetName?: string | null;
  issuerAvatarUrl?: string | null;
  targetAvatarUrl?: string | null;
  topic?: string | null;
  onOpenChange: (open: boolean) => void;
  onSupport: (input: EndorsementSupportSubmitInput) => Promise<string[]>;
  onConfirmed?: () => void;
}

export function EndorsementSupportModal({
  open,
  endorsementId,
  recipientAccountId,
  recipientDisplayName,
  issuer,
  issuerName,
  targetName,
  issuerAvatarUrl,
  targetAvatarUrl,
  topic,
  onOpenChange,
  onSupport,
  onConfirmed,
}: EndorsementSupportModalProps) {
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const {
    accountId: viewerAccountId,
    connect,
    isConnected,
    isLoading: isWalletBootstrapping,
  } = useWallet();
  const { txResult, clearTxResult, trackTransaction } =
    useNearTransactionFeedback(viewerAccountId);
  const [amount, setAmount] = useState('1');
  const [walletBalanceYocto, setWalletBalanceYocto] = useState<bigint | null>(
    null
  );
  const [routing, setRouting] =
    useState<SupportEndorsementRoutingDisclosure | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minAmountYocto = routing?.minAmountYocto ?? null;
  const presetAmounts = useMemo(
    () =>
      minAmountYocto != null
        ? supportPresetsAtOrAboveMin(
            minAmountYocto,
            SUPPORT_PROFILE_PRESET_SOCIAL
          )
        : [...SUPPORT_PROFILE_PRESET_SOCIAL],
    [minAmountYocto]
  );
  const recipientShareLabel = formatSupportProfileRecipientSharePercent(
    routing?.targetBps
  );
  const treasuryShareLabel = formatSupportProfileTreasurySharePercent(
    routing?.treasuryBps
  );

  const topicLabel = humanizeEndorsementTopic(topic ?? undefined) || 'General';

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAmount('1');
    let cancelled = false;
    void fetchSupportEndorsementRouting()
      .then((nextRouting) => {
        if (!cancelled) setRouting(nextRouting);
      })
      .catch(() => {
        if (!cancelled) setRouting(null);
      });
    if (!viewerAccountId) {
      setWalletBalanceYocto(null);
      return () => {
        cancelled = true;
      };
    }
    void getSocialWalletBalanceYocto(viewerAccountId)
      .then((balance) => {
        if (!cancelled) setWalletBalanceYocto(balance);
      })
      .catch(() => {
        if (!cancelled) setWalletBalanceYocto(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, viewerAccountId]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!isConnected) {
      await connect();
      return;
    }

    let amountYocto: bigint;
    const normalizedAmount = finalizeAmountInput(
      amount,
      SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS
    );
    try {
      amountYocto = parseSupportAmountYocto(
        normalizedAmount,
        minAmountYocto ?? SUPPORT_PROFILE_MIN_YOCTO
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid amount.');
      return;
    }

    if (walletBalanceYocto != null && amountYocto > walletBalanceYocto) {
      setError('Insufficient SOCIAL wallet balance.');
      return;
    }

    setPending(true);
    try {
      const txHashes = await onSupport({
        endorsementId,
        recipientAccountId,
        amountYocto: amountYocto.toString(),
        issuer,
        topic,
      });
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastPending.sendingEndorsementSupport,
        successMessage:
          txToastSuccess.endorsementSupportSent(recipientDisplayName),
        failureMessage: txToastError.endorsementSupportFailed,
      });
      if (confirmed) {
        onConfirmed?.();
        onOpenChange(false);
      }
    } catch (err) {
      if (!isWalletUserCancellation(err)) {
        reportWalletActionFailure(err, (msg) => setError(msg));
      }
    } finally {
      setPending(false);
    }
  }, [
    amount,
    connect,
    endorsementId,
    isConnected,
    issuer,
    minAmountYocto,
    onConfirmed,
    onOpenChange,
    onSupport,
    recipientAccountId,
    recipientDisplayName,
    topic,
    trackTransaction,
    walletBalanceYocto,
  ]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            {...fadeMotion(reduceMotion ? 0 : 0.18)}
            data-lenis-prevent
            className="fixed inset-0 z-[2147483645] flex items-center justify-center px-4 py-6"
          >
            <button
              type="button"
              className="absolute inset-0 bg-background/72 backdrop-blur-md"
              aria-label="Close endorsement support dialog"
              onClick={() => onOpenChange(false)}
            />
            <motion.div
              {...scaleFadeMotion(!!reduceMotion, {
                y: 14,
                scale: 0.98,
                duration: 0.22,
                exitY: 8,
                exitScale: 0.99,
              })}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className={socialSpendModalShellClass()}
            >
              <SocialSpendModalHeader
                titleId={titleId}
                eyebrow="Support endorsement"
                title={
                  <span className="text-[var(--portal-gold-text)]">
                    {topicLabel}
                  </span>
                }
                closeAriaLabel="Close endorsement support dialog"
                onClose={() => onOpenChange(false)}
              >
                <SocialSpendEndorsementIdentity
                  issuer={issuer}
                  target={recipientAccountId}
                  issuerName={issuerName}
                  targetName={targetName ?? recipientDisplayName}
                  issuerAvatarUrl={issuerAvatarUrl}
                  targetAvatarUrl={targetAvatarUrl}
                  viewerAccountId={viewerAccountId}
                />
              </SocialSpendModalHeader>

              <div className={socialSpendModalBodyClass}>
                <SocialSpendAmountForm
                  amount={amount}
                  onAmountChange={setAmount}
                  presetAmounts={presetAmounts}
                  minAmountYocto={minAmountYocto}
                  walletBalanceYocto={walletBalanceYocto}
                  pending={pending}
                  error={error}
                  onSubmit={() => void handleSubmit()}
                  isWalletBootstrapping={isWalletBootstrapping}
                  isConnected={isConnected}
                  connectedSubmitLabel="Send support"
                  facts={
                    <SocialSpendRoutingCaption
                      recipientAccountId={recipientAccountId}
                      recipientShareLabel={recipientShareLabel}
                      treasuryShareLabel={treasuryShareLabel}
                    />
                  }
                />
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>,
    document.body
  );
}
