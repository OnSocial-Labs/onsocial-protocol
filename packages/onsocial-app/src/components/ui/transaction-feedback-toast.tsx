'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckIcon,
  ExternalLinkIcon,
  MultiplyIcon,
} from '@onsocial/ui';
import { useToastDismissTimer } from '@/hooks/use-toast-dismiss-timer';

export type TransactionFeedback = {
  type: 'success' | 'error';
  msg: string;
  /** Optional override — default toast is one-line (no eyebrow). */
  eyebrow?: string;
  explorerHref?: string | null;
  /** In-app navigation (e.g. Messages). Prefer over explorerHref for app routes. */
  actionHref?: string | null;
  actionLabel?: string | null;
};

const DISMISS_MS = { success: 3500, error: 7000 } as const;

function ToastStatusIcon({ type }: { type: TransactionFeedback['type'] }) {
  if (type === 'success') {
    return (
      <CheckIcon
        className="app-tx-toast-icon app-tx-toast-icon--success"
        aria-hidden
      />
    );
  }
  return (
    <MultiplyIcon
      className="app-tx-toast-icon app-tx-toast-icon--error"
      aria-hidden
    />
  );
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

  const dismissMs = result ? DISMISS_MS[result.type] : 0;
  const { paused, barRef, hostRef, pauseProps } = useToastDismissTimer({
    active: Boolean(result),
    durationMs: dismissMs,
    onDone: () => onCloseRef.current(),
  });

  if (typeof document === 'undefined' || !result) return null;

  return createPortal(
    <div className="app-tx-toast-anchor" role="presentation">
      <div
        ref={hostRef}
        className={`app-tx-toast is-${result.type}${paused ? ' is-paused' : ''}`}
        role="status"
        aria-live="polite"
        {...pauseProps}
      >
        <div className="app-tx-toast-row">
          <div className="app-tx-toast-icon-wrap">
            <div
              className={`app-tx-toast-icon-halo app-tx-toast-icon-halo--${result.type}`}
              aria-hidden
            />
            <ToastStatusIcon type={result.type} />
          </div>
          <div className="app-tx-toast-copy">
            {result.eyebrow ? (
              <span className="app-tx-toast-eyebrow">{result.eyebrow}</span>
            ) : null}
            <span className="app-tx-toast-message">{result.msg}</span>
          </div>
          {result.actionHref ? (
            <a
              className="app-tx-toast-explorer"
              href={result.actionHref}
              aria-label={result.actionLabel ?? 'Open'}
              title={result.actionLabel ?? 'Open'}
            >
              <ExternalLinkIcon
                className="app-tx-toast-explorer-icon"
                aria-hidden
              />
            </a>
          ) : result.explorerHref ? (
            <a
              className="app-tx-toast-explorer"
              href={result.explorerHref}
              target="_blank"
              rel="noreferrer"
              aria-label="View on Nearblocks"
              title="View on Nearblocks"
            >
              <ExternalLinkIcon
                className="app-tx-toast-explorer-icon"
                aria-hidden
              />
            </a>
          ) : null}
          <button
            type="button"
            className="app-tx-toast-close"
            onClick={onClose}
            aria-label="Dismiss"
          >
            <MultiplyIcon className="app-tx-toast-close-icon" aria-hidden />
          </button>
        </div>
        <div
          ref={barRef}
          className={`app-tx-toast-progress app-tx-toast-progress--${result.type}`}
          aria-hidden
        />
      </div>
    </div>,
    document.body
  );
}
