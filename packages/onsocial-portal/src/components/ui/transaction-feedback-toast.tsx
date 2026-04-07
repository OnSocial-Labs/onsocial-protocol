'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ExternalLink, RefreshCw, X } from 'lucide-react';

export type TransactionFeedback = {
  type: 'pending' | 'success' | 'error';
  msg: string;
  pendingPhase?: 'wallet' | 'chain';
  explorerHref?: string | null;
};

export function TransactionFeedbackToast({
  result,
  onClose,
}: {
  result: TransactionFeedback | null;
  onClose: () => void;
}) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!result || result.type === 'pending') {
      return;
    }

    const timeout = result.type === 'success' ? 5000 : 7000;
    const timer = window.setTimeout(() => {
      onCloseRef.current();
    }, timeout);

    return () => {
      window.clearTimeout(timer);
    };
  }, [result]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence initial={false}>
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none fixed inset-x-6 bottom-6 z-[2147483647] mx-auto w-auto max-w-md md:inset-x-4 md:bottom-auto md:top-20 md:w-full md:max-w-xl"
        >
          <div
            className={`pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 ${
              result.type === 'success'
                ? 'portal-green-toast'
                : result.type === 'error'
                  ? 'portal-red-toast'
                  : 'portal-neutral-toast'
            }`}
          >
            {result.type === 'success' ? (
              <Check className="portal-green-icon h-5 w-5 flex-shrink-0" />
            ) : result.type === 'pending' ? (
              <RefreshCw className="portal-blue-icon h-5 w-5 flex-shrink-0 animate-spin" />
            ) : (
              <X className="portal-red-icon h-5 w-5 flex-shrink-0" />
            )}
            <div className="flex-1">
              {result.type === 'pending' && result.pendingPhase ? (
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {result.pendingPhase === 'wallet'
                    ? 'Waiting For Wallet Approval'
                    : 'Confirming On-Chain'}
                </span>
              ) : null}
              <span className="block text-sm font-medium">{result.msg}</span>
              {result.explorerHref && (
                <a
                  href={result.explorerHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portal-action-link mt-1 inline-flex items-center gap-1 text-xs"
                >
                  View on Nearblocks
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
