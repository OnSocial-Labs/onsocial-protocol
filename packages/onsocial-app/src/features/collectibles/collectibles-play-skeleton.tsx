/**
 * Player cold-load shell — cover / title / author match immersive ready geometry.
 */
export function CollectiblesPlaySkeleton() {
  return (
    <div
      className="collectibles-play-body collectibles-play-body--skeleton"
      aria-busy="true"
      aria-label="Loading player"
    >
      <p className="sr-only">Loading player…</p>
      <div className="scarce-clip-player-shell" aria-hidden>
        <div className="scarce-clip-player">
          <div className="standing-row-shimmer scarce-clip-player-cover collectibles-play-skeleton-cover" />
        </div>
      </div>
      <div className="collectibles-play-title-row collection-title-row" aria-hidden>
        <span className="standing-row-shimmer collectibles-play-skeleton-title" />
      </div>
      <div className="collectibles-play-creator collection-meta" aria-hidden>
        <span className="standing-row-shimmer collection-skeleton-avatar" />
        <div className="collection-meta-copy">
          <span className="standing-row-shimmer collection-skeleton-creator-name" />
          <span className="standing-row-shimmer collection-skeleton-line-sm" />
        </div>
      </div>
    </div>
  );
}
