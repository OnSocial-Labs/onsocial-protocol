'use client';

/** 2px top hairline — glanceable place-in-piece, not a title or a player. */
export function ArticleReadProgress({ progress }: { progress: number }) {
  const ratio = Math.min(1, Math.max(0, progress));
  return (
    <div
      className="article-read-progress"
      role="progressbar"
      aria-label="Reading progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
    >
      <span
        className="article-read-progress-bar"
        style={{ transform: `scaleX(${ratio})` }}
      />
    </div>
  );
}
