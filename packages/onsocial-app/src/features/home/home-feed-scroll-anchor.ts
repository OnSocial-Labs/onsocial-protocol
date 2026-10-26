/**
 * Scroll anchoring for in-place list re-ranks (Focus Hot append merges).
 * Capture the first painted feed block before the merge, then put it back
 * at its viewport offset before paint so the re-rank is invisible.
 */
export type FeedScrollAnchor = { key: string; top: number };

/** First feed block whose bottom edge is still inside the scroll root. */
export function captureVisibleFeedAnchor(
  root: HTMLElement | null
): FeedScrollAnchor | null {
  if (!root) return null;
  const rootTop = root.getBoundingClientRect().top;
  for (const block of root.querySelectorAll<HTMLElement>(
    '.home-feed-block[data-feed-key]'
  )) {
    const rect = block.getBoundingClientRect();
    if (rect.bottom > rootTop + 1) {
      return { key: block.dataset.feedKey!, top: rect.top - rootTop };
    }
  }
  return null;
}

/** Scroll so the anchored row sits at its captured viewport offset. */
export function restoreFeedAnchor(
  root: HTMLElement | null,
  anchor: FeedScrollAnchor
): void {
  if (!root) return;
  const block = root.querySelector<HTMLElement>(
    `.home-feed-block[data-feed-key="${CSS.escape(anchor.key)}"]`
  );
  if (!block) return;
  const delta =
    block.getBoundingClientRect().top -
    root.getBoundingClientRect().top -
    anchor.top;
  if (Math.abs(delta) > 1) root.scrollTop += delta;
}
