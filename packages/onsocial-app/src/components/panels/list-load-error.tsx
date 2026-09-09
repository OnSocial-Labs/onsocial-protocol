'use client';

import { OsEmptyAction } from '@/lib/os-empty-action';

export function ListLoadError({
  message,
  onRetry,
  retryLabel = 'Try again',
}: {
  message: string;
  onRetry: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="standing-panel-error-block" role="alert">
      <p className="standing-panel-error">{message}</p>
      <OsEmptyAction onClick={onRetry}>{retryLabel}</OsEmptyAction>
    </div>
  );
}
