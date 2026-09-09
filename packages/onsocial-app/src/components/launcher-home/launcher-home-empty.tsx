'use client';

import type { ReactNode } from 'react';
import { OsEmptyAction } from '@/lib/os-empty-action';

/** Quiet one-line status under a launcher Home section. */
export function LauncherHomeEmpty({ children }: { children: ReactNode }) {
  return <p className="launcher-home-empty">{children}</p>;
}

/** Load failure with Retry — not a silent empty list. */
export function LauncherHomeError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="launcher-home-empty-block">
      <p className="launcher-home-empty">{message}</p>
      <OsEmptyAction onClick={onRetry}>Retry</OsEmptyAction>
    </div>
  );
}
