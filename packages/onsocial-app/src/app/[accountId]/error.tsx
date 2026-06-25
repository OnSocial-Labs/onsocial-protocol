'use client';

interface AccountErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AccountError({ error, reset }: AccountErrorProps) {
  return (
    <main className="frame app-surface">
      <div className="portfolio-container panel-page">
        <div className="panel-error">
          <h1 className="panel-page-title">Could not load page</h1>
          <p className="panel-page-description">
            {error.message || 'Try again in a moment.'}
          </p>
          <button type="button" className="panel-action" onClick={reset}>
            Retry
          </button>
        </div>
      </div>
    </main>
  );
}
