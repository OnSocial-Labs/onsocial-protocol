'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ExternalLink, RefreshCw, X } from 'lucide-react';

export type TransactionFeedback = {
  type: 'pending' | 'success' | 'error';
  msg: string;
  pendingPhase?: 'wallet' | 'chain';
  explorerHref?: string | null;
};

const DISMISS_MS = { success: 5000, error: 7000 } as const;

export function TransactionFeedbackToast({
  result,
  onClose,
}: {
  result: TransactionFeedback | null;
  onClose: () => void;
}) {
  const onCloseRef = useRef(onClose);
  const [dismissKey, setDismissKey] = useState(0);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!result || result.type === 'pending') return;
    setDismissKey((k) => k + 1);
    const timeout = DISMISS_MS[result.type];
    const timer = window.setTimeout(() => onCloseRef.current(), timeout);
    return () => window.clearTimeout(timer);
  }, [result]);

  if (typeof document === 'undefined') return null;

  const duration =
    result && result.type !== 'pending' ? DISMISS_MS[result.type] : 0;

  return createPortal(
    <AnimatePresence initial={false}>
      {result && (
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
          className="pointer-events-none fixed inset-x-4 bottom-6 z-[2147483647] mx-auto max-w-sm sm:bottom-auto sm:inset-x-auto sm:right-5 sm:top-20 md:right-6"
        >
          <div className="portal-toast pointer-events-auto relative overflow-hidden rounded-xl">
            {/* ── accent glow line ── */}
            <div
              className={`absolute inset-x-0 top-0 h-px ${
                result.type === 'success'
                  ? 'bg-gradient-to-r from-transparent via-[var(--portal-green)] to-transparent'
                  : result.type === 'error'
                    ? 'bg-gradient-to-r from-transparent via-[var(--portal-red)] to-transparent'
                    : 'bg-gradient-to-r from-transparent via-[var(--portal-blue)] to-transparent'
              }`}
              style={{ opacity: 0.7 }}
            />

            <div className="flex items-start gap-3 px-3.5 py-3">
              {/* ── icon with soft halo ── */}
              <div className="relative mt-0.5 flex-shrink-0">
                <div
                  className={`absolute -inset-1.5 rounded-full blur-md ${
                    result.type === 'success'
                      ? 'bg-[var(--portal-green)]'
                      : result.type === 'error'
                        ? 'bg-[var(--portal-red)]'
                        : 'bg-[var(--portal-blue)]'
                  }`}
                  style={{ opacity: 0.15 }}
                />
                {result.type === 'success' ? (
                  <Check className="portal-green-icon relative h-4 w-4" />
                ) : result.type === 'pending' ? (
                  <RefreshCw className="portal-blue-icon relative h-4 w-4 animate-spin" />
                ) : (
                  <X className="portal-red-icon relative h-4 w-4" />
                )}
              </div>

              {/* ── content ── */}
              <div className="min-w-0 flex-1">
                {result.type === 'pending' && result.pendingPhase ? (
                  <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
                    {result.pendingPhase === 'wallet'
                      ? 'Waiting For Wallet'
                      : 'Confirming On-Chain'}
                  </span>
                ) : null}
                <span className="block text-[13px] leading-snug font-medium">
                  {result.msg}
                </span>
                {result.explorerHref && (
                  <a
                    href={result.explorerHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="portal-action-link mt-1 inline-flex items-center gap-1 text-[11px]"
                  >
                    View on Nearblocks
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>

              {/* ── ghost close ── */}
              <button
                type="button"
                onClick={onClose}
                className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            {/* ── auto-dismiss countdown bar ── */}
            {result.type !== 'pending' && (
              <motion.div
                key={dismissKey}
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: duration / 1000, ease: 'linear' }}
                className={`h-px origin-left ${
                  result.type === 'success'
                    ? 'bg-[var(--portal-green)]'
                    : 'bg-[var(--portal-red)]'
                }`}
                style={{ opacity: 0.45 }}
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
