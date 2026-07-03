'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TX_TOAST_EYEBROW } from '@/lib/transaction-toast-copy';

export type TransactionFeedback = {
  type: 'pending' | 'success' | 'error';
  msg: string;
  eyebrow?: string;
  pendingPhase?: 'wallet' | 'chain';
  explorerHref?: string | null;
};

const DISMISS_MS = { success: 5000, error: 7000 } as const;

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

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!result || result.type === 'pending') return;
    const timeout = DISMISS_MS[result.type];
    const timer = window.setTimeout(() => onCloseRef.current(), timeout);
    return () => window.clearTimeout(timer);
  }, [result]);

  if (typeof document === 'undefined' || !result) return null;

  const eyebrow = resolveToastEyebrow(result);

  return createPortal(
    <div
      className={`app-tx-toast is-${result.type}`}
      role="status"
      aria-live="polite"
    >
      {eyebrow ? <span className="app-tx-toast-eyebrow">{eyebrow}</span> : null}
      <p className="app-tx-toast-message">{result.msg}</p>
      {result.explorerHref ? (
        <a
          className="app-tx-toast-link"
          href={result.explorerHref}
          target="_blank"
          rel="noreferrer"
        >
          View on Nearblocks
        </a>
      ) : null}
    </div>,
    document.body
  );
}
