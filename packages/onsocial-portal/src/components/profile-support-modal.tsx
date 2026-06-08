'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { HeartHandshake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import { useWallet } from '@/contexts/wallet-context';
import { portalElevatedShadowClass } from '@/components/ui/floating-panel';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import { getSocialWalletBalanceYocto, yoctoToSocial } from '@/lib/near-rpc';
import {
  parseSupportAmountYocto,
  SUPPORT_PROFILE_MIN_SOCIAL_LABEL,
  SUPPORT_PROFILE_PRESET_SOCIAL,
} from '@/lib/social-spend-profile';
import {
  isWalletUserCancellation,
  reportWalletActionFailure,
} from '@/lib/wallet-errors';
import { cleanHandle } from '@/lib/endorsements';
import { cn } from '@/lib/utils';

interface ProfileSupportModalProps {
  open: boolean;
  targetAccountId: string;
  targetDisplayName: string;
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
  onOpenChange,
  onSupport,
}: ProfileSupportModalProps) {
  const reduceMotion = useReducedMotion();
  const { accountId: viewerAccountId, connect, isConnected } = useWallet();
  const { txResult, setTxResult, clearTxResult, trackTransaction } =
    useNearTransactionFeedback(viewerAccountId);
  const [amount, setAmount] = useState('1');
  const [walletBalanceYocto, setWalletBalanceYocto] = useState<bigint | null>(
    null
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = cleanHandle(targetAccountId);
  const displayName = targetDisplayName || `@${handle}`;

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAmount('1');
    if (!viewerAccountId) {
      setWalletBalanceYocto(null);
      return;
    }
    let cancelled = false;
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

  const walletBalanceLabel = useMemo(() => {
    if (walletBalanceYocto == null) return null;
    return yoctoToSocial(walletBalanceYocto.toString());
  }, [walletBalanceYocto]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!isConnected) {
      await connect();
      return;
    }

    let amountYocto: bigint;
    try {
      amountYocto = parseSupportAmountYocto(amount);
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
        submittedMessage: 'Sending support…',
        successMessage: `Support sent to ${displayName}.`,
        failureMessage: 'Support transaction failed.',
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
    isConnected,
    onOpenChange,
    onSupport,
    targetAccountId,
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
              {...scaleFadeMotion(!!reduceMotion, { y: 8 })}
              role="dialog"
              aria-modal="true"
              aria-labelledby="profile-support-title"
              className={cn(
                'relative z-10 w-full max-w-md rounded-2xl border border-border/50 bg-card p-5 shadow-2xl',
                portalElevatedShadowClass
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <HeartHandshake className="portal-green-icon h-4 w-4 shrink-0" />
                  <h2
                    id="profile-support-title"
                    className="text-base font-semibold tracking-tight"
                  >
                    Support {displayName}
                  </h2>
                </div>
                <ModalCloseButton
                  ariaLabel="Close support dialog"
                  onClick={() => onOpenChange(false)}
                />
              </div>

              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Send SOCIAL from your wallet. About 95% accrues for them to
                claim; the rest goes to treasury. Counts toward their Season 0
                support score after they have joined the rally.
              </p>

              {walletBalanceLabel != null ? (
                <p className="mt-2 text-xs text-muted-foreground/80">
                  Your balance: {walletBalanceLabel} SOCIAL
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {SUPPORT_PROFILE_PRESET_SOCIAL.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                      amount === preset
                        ? 'border-[var(--portal-green-border-strong)] bg-[var(--portal-green-bg)] text-[var(--portal-green)]'
                        : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
                    )}
                    onClick={() => setAmount(preset)}
                  >
                    {preset} SOCIAL
                  </button>
                ))}
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-medium text-muted-foreground">
                  Amount (SOCIAL)
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-green-border)]"
                  placeholder={SUPPORT_PROFILE_MIN_SOCIAL_LABEL}
                />
              </label>

              <p className="mt-1.5 text-xs text-muted-foreground/70">
                Minimum {SUPPORT_PROFILE_MIN_SOCIAL_LABEL} SOCIAL per support.
              </p>

              {error ? (
                <p className="mt-3 rounded-lg border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs text-[var(--portal-red)]">
                  {error}
                </p>
              ) : null}

              <div className="mt-5 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="accent"
                  loading={pending}
                  disabled={pending}
                  onClick={() => void handleSubmit()}
                >
                  {isConnected ? 'Send support' : 'Connect wallet'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>,
    document.body
  );
}
