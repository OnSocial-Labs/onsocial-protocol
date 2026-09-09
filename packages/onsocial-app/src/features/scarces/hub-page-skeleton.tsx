import { HUB_PAGE_SKELETON_CLASS } from '@/lib/os-chrome-page';

function HubCatalogBones() {
  return (
    <div className="market-listing-list" aria-hidden>
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="market-listing-row market-listing-row--skeleton"
        >
          <span className="standing-row-shimmer market-listing-thumb-shimmer" />
          <div className="market-listing-copy">
            <div className="market-listing-head">
              <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-title" />
            </div>
            <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-meta" />
          </div>
          <div className="market-listing-action-col">
            <span className="standing-row-shimmer market-listing-shimmer-action" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Hub cold-load shell — hero + list bones reserve geometry so the
 * screen does not jump when the catalog settles.
 */
export function HubPageSkeleton({ listOnly = false }: { listOnly?: boolean }) {
  if (listOnly) {
    return (
      <div
        className="hub-page--skeleton"
        aria-busy="true"
        aria-label="Loading hub catalog"
        data-hub-page-skeleton
      >
        <p className="sr-only">Loading hub…</p>
        <HubCatalogBones />
      </div>
    );
  }

  return (
    <div
      className={HUB_PAGE_SKELETON_CLASS}
      aria-busy="true"
      aria-label="Loading hub"
      data-hub-page-skeleton
    >
      <p className="sr-only">Loading hub…</p>
      <header className="app-page-hero" aria-hidden>
        <div className="app-hub-cover guild-hero-cover--fallback" />
        <div className="app-page-head app-page-head--overlap">
          <span className="standing-row-shimmer series-skeleton-logo" />
          <div className="app-page-headings">
            <span className="standing-row-shimmer series-skeleton-title" />
            <span className="standing-row-shimmer series-skeleton-line-sm" />
          </div>
        </div>
      </header>
      <HubCatalogBones />
    </div>
  );
}
