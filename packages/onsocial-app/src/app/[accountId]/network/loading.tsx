/** Shown the moment the globe opens the map, while the sample is still loading. */
export default function NetworkLoading() {
  return (
    <div
      className="os-app-screen app-surface"
      data-tone="os"
      data-compact-chrome="true"
      data-glass-chrome="true"
      aria-busy="true"
    >
      <div className="os-app-screen-column">
        <header className="os-app-screen-header">
          <div className="os-app-screen-nav-row">
            <div className="os-app-screen-heading">
              <h1 className="os-app-screen-title">Network</h1>
            </div>
          </div>
        </header>
        <main className="os-app-screen-body">
          <div className="network-orbit-panel">
            <div className="network-orbit-stage-wrap">
              <div
                className="network-orbit-stage-skeleton standing-row-shimmer"
                aria-hidden="true"
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
