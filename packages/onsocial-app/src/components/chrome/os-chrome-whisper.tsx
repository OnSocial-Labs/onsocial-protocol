'use client';

import type { ReactNode } from 'react';
import { cn } from '@onsocial/ui';

/**
 * Fixed chrome whisper — sits under measured header chrome and never
 * reserves document flow (same contract as Discover connect / Messages passkey).
 */
export function OsChromeWhisper({
  children,
  role = 'status',
  className,
}: {
  children: ReactNode;
  role?: 'status' | 'alert';
  className?: string;
}) {
  return (
    <div className="os-chrome-whisper-anchor" role={role}>
      <div className={cn('os-chrome-whisper', className)}>{children}</div>
    </div>
  );
}

/** Live-list error / retry — overlays painted rows instead of shoving them. */
export function OsChromeListAlert({
  message,
  onRetry,
  retryLabel = 'Try again',
  className,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <OsChromeWhisper role="alert" className={cn('os-chrome-whisper--alert', className)}>
      <span className="os-chrome-whisper-copy">{message}</span>
      {onRetry ? (
        <button
          type="button"
          className="os-chrome-whisper-retry"
          onClick={onRetry}
        >
          {retryLabel}
        </button>
      ) : null}
    </OsChromeWhisper>
  );
}
