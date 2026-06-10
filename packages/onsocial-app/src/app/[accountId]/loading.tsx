export default function AccountLoading() {
  return (
    <main className="frame">
      <div className="portfolio-container">
        <div className="portfolio-loading animate-rise-in" aria-hidden="true">
          <div className="portfolio-loading-banner" />
          <div className="portfolio-loading-avatar" />
          <div className="portfolio-loading-line portfolio-loading-line-lg" />
          <div className="portfolio-loading-line portfolio-loading-line-sm" />
        </div>
      </div>
    </main>
  );
}
