export default function AccountLoading() {
  return (
    <main className="frame app-surface portfolio-frame">
      <div className="portfolio-hero">
        <div className="portfolio-loading portfolio-identity animate-rise-in" aria-hidden="true">
          <div className="portfolio-loading-avatar" />
          <div className="portfolio-loading-line portfolio-loading-line-lg" />
          <div className="portfolio-loading-line portfolio-loading-line-sm" />
        </div>
      </div>
    </main>
  );
}
