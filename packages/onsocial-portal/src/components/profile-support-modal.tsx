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
  SocialSpendModalHeader,
  SocialSpendProfileIdentity,
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
  fetchSupportProfileRouting,
  formatSupportProfileRecipientSharePercent,
  formatSupportProfileTreasurySharePercent,
  parseSupportAmountYocto,
  supportPresetsAtOrAboveMin,
  SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS,
  SUPPORT_PROFILE_MIN_YOCTO,
  SUPPORT_PROFILE_PRESET_SOCIAL,
  type SupportProfileRoutingDisclosure,
} from '@/lib/social-spend-profile';
import {
  isWalletUserCancellation,
  reportWalletActionFailure,
} from '@/lib/wallet-errors';
import { cleanHandle } from '@/lib/endorsements';

interface ProfileSupportModalProps {
  open: boolean;
  targetAccountId: string;
  targetDisplayName: string;
  targetAvatarUrl?: string | null;
  onOpenChange: (open: boolean) => void;
  onSupport: (
    targetAccountId: string,
    amountYocto: string
  ) => Promise<string[]>;
}

export function ProfileSupportModal({
  open,
  targetAccountId,
  targetDisplayName,
  targetAvatarUrl = null,
  onOpenChange,
  onSupport,
}: ProfileSupportModalProps) {
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
    useState<SupportProfileRoutingDisclosure | null>(null);
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

  const handle = cleanHandle(targetAccountId);
  const displayName = targetDisplayName || `@${handle}`;

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAmount('1');
    let cancelled = false;
    void fetchSupportProfileRouting()
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
      const txHashes = await onSupport(targetAccountId, amountYocto.toString());
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastPending.sendingSupport,
        successMessage: txToastSuccess.supportSent(displayName),
        failureMessage: txToastError.supportFailed,
      });
      if (confirmed) onOpenChange(false);
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
    displayName,
    isConnected,
    minAmountYocto,
    onOpenChange,
    onSupport,
    targetAccountId,
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
              aria-label="Close support dialog"
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
                eyebrow="Profile support"
                title={
                  <span className="text-[var(--portal-green)]">
                    Send SOCIAL
                  </span>
                }
                closeAriaLabel="Close support dialog"
                onClose={() => onOpenChange(false)}
              >
                <SocialSpendProfileIdentity
                  displayName={displayName}
                  avatarUrl={targetAvatarUrl}
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
                      recipientAccountId={targetAccountId}
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
