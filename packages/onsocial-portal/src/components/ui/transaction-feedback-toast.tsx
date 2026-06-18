'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ExternalLink, RefreshCw, X } from 'lucide-react';
import { TX_TOAST_EYEBROW } from '@/lib/transaction-toast-copy';
import { cn } from '@/lib/utils';

export type TransactionFeedback = {
  type: 'pending' | 'success' | 'error';
  msg: string;
  eyebrow?: string;
  subtitle?: string;
  pendingPhase?: 'wallet' | 'chain';
  explorerHref?: string | null;
};

const DISMISS_MS = { success: 5000, error: 7000 } as const;

const TOAST_POSITION_CLASS = cn(
  'pointer-events-none fixed z-[2147483647] mx-auto w-full max-w-sm',
  'bottom-[max(1.5rem,env(safe-area-inset-bottom,0px))]',
  'left-[max(1rem,env(safe-area-inset-left,0px))]',
  'right-[max(1rem,env(safe-area-inset-right,0px))]',
  'sm:mx-0 sm:bottom-auto sm:left-auto sm:w-auto',
  'sm:right-[max(1.25rem,env(safe-area-inset-right,0px))]',
  'sm:top-[max(5rem,calc(env(safe-area-inset-top,0px)+4rem))]',
  'md:right-6'
);

function toastAccentClass(type: TransactionFeedback['type']): string {
  switch (type) {
    case 'success':
      return 'via-[var(--portal-green)]';
    case 'error':
      return 'via-[var(--portal-red)]';
    default:
      return 'via-[var(--portal-blue)]';
  }
}

function toastIconHaloClass(type: TransactionFeedback['type']): string {
  switch (type) {
    case 'success':
      return 'bg-[var(--portal-green)]';
    case 'error':
      return 'bg-[var(--portal-red)]';
    default:
      return 'bg-[var(--portal-blue)]';
  }
}

function ToastStatusIcon({ type }: { type: TransactionFeedback['type'] }) {
  if (type === 'success') {
    return <Check className="portal-green-icon relative h-4 w-4" />;
  }
  if (type === 'pending') {
    return (
      <RefreshCw className="portal-blue-icon relative h-4 w-4 animate-spin" />
    );
  }
  return <X className="portal-red-icon relative h-4 w-4" />;
}

function resolveToastEyebrow(result: TransactionFeedback): string | null {
  if (result.eyebrow) {
    return result.eyebrow;
  }
  if (result.type === 'pending' && result.pendingPhase) {
    return result.pendingPhase === 'wallet'
      ? TX_TOAST_EYEBROW.wallet
      : TX_TOAST_EYEBROW.confirming;
  }
  return null;
}

export function TransactionFeedbackToast({
  result,
  onClose,
}: {
  result: TransactionFeedback | null;
  onClose: () => void;
}) {
  const onCloseRef = useRef(onClose);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!result || result.type === 'pending') return;
    const timeout = DISMISS_MS[result.type];
    const timer = window.setTimeout(() => onCloseRef.current(), timeout);
    return () => window.clearTimeout(timer);
  }, [result]);

  if (typeof document === 'undefined') return null;

  const duration =
    result && result.type !== 'pending' ? DISMISS_MS[result.type] : 0;
  const dismissKey = result
    ? `${result.type}:${result.eyebrow ?? ''}:${result.msg}:${result.subtitle ?? ''}:${result.explorerHref ?? ''}`
    : 'none';
  const stateMotion = reduceMotion
    ? { initial: false, animate: undefined, exit: undefined }
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
        transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
      };

  return createPortal(
    <AnimatePresence initial={false}>
      {result ? (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.96, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 8, scale: 0.96, filter: 'blur(4px)' }}
          transition={{
            type: 'spring',
            stiffness: 380,
            damping: 26,
            mass: 0.8,
          }}
          className={TOAST_POSITION_CLASS}
        >
          <div className="portal-toast pointer-events-auto relative overflow-hidden rounded-xl">
            <div
              className={cn(
                'absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent transition-opacity duration-300',
                toastAccentClass(result.type)
              )}
              style={{ opacity: 0.7 }}
            />

            <div className="flex items-start gap-3 px-3.5 py-3">
              <div className="relative mt-0.5 flex-shrink-0">
                <div
                  className={cn(
                    'absolute -inset-1.5 rounded-full blur-md transition-colors duration-300',
                    toastIconHaloClass(result.type)
                  )}
                  style={{ opacity: 0.15 }}
                />
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={result.type}
                    className="relative"
                    {...stateMotion}
                  >
                    <ToastStatusIcon type={result.type} />
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="min-w-0 flex-1">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={`${result.type}:${result.msg}`}
                    {...stateMotion}
                  >
                    {resolveToastEyebrow(result) ? (
                      <span className="mb-0.5 block portal-eyebrow-wide text-muted-foreground/70">
                        {resolveToastEyebrow(result)}
                      </span>
                    ) : null}
                    <span className="block portal-type-body leading-snug font-medium">
                      {result.msg}
                    </span>
                    {result.subtitle ? (
                      <span className="mt-1 block portal-type-label leading-snug text-muted-foreground/80">
                        {result.subtitle}
                      </span>
                    ) : null}
                  </motion.div>
                </AnimatePresence>
                {result.explorerHref ? (
                  <a
                    href={result.explorerHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="portal-action-link mt-1 inline-flex items-center gap-1 portal-type-label"
                  >
                    View on Nearblocks
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ) : null}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            {result.type !== 'pending' ? (
              <motion.div
                key={dismissKey}
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: duration / 1000, ease: 'linear' }}
                className={cn(
                  'h-px origin-left transition-colors duration-300',
                  result.type === 'success'
                    ? 'bg-[var(--portal-green)]'
                    : 'bg-[var(--portal-red)]'
                )}
                style={{ opacity: 0.45 }}
              />
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
