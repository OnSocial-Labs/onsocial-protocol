'use client';

export function ListLoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="standing-panel-error-block" role="alert">
      <p className="standing-panel-error">{message}</p>
      <button
        type="button"
        className="standing-panel-error-retry"
        onClick={onRetry}
      >
        Try again
      </button>
    </div>
  );
}
