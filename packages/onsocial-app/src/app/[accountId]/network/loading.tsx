import {
  NetworkLoadingCenter,
  NetworkLoadingTitle,
} from '@/components/panels/network-loading-title';

/** Shown the moment the globe opens the map, while the sample is still loading. */
export default function NetworkLoading() {
  return (
    <div
      className="os-app-screen network-orbit-screen app-surface"
      data-tone="os"
      data-compact-chrome="true"
      data-glass-chrome="true"
      data-dock-back="true"
      aria-busy="true"
    >
      <div className="os-app-screen-column">
        <header className="os-app-screen-header">
          <div className="os-app-screen-nav-row">
            <div className="os-app-screen-heading">
              <NetworkLoadingTitle />
            </div>
            <div className="os-app-screen-actions" aria-hidden="true">
              <span className="network-loading-icon" />
            </div>
          </div>
          <div className="os-app-screen-toolbar" aria-hidden="true">
            <div className="network-loading-toolbar" />
          </div>
        </header>
        <main className="os-app-screen-body os-stable-scroll">
          <div className="network-orbit-panel">
            <div className="network-orbit-caption-row" aria-hidden="true" />
            <div className="network-orbit-stage-wrap">
              <div className="network-orbit-stage-bg" aria-hidden="true" />
              <NetworkLoadingCenter />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
