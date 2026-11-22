import { shiftAppLenisScroll } from '@/lib/app-lenis-registry';

/**
 * Scroll anchoring for in-place list re-ranks (Focus Hot append merges) and
 * for windowed-list height corrections. Capture the first painted row before
 * the mutation, then put it back at its viewport offset before paint so the
 * change is invisible. Row lookup is query-driven so any keyed list (feed
 * blocks, thread reply rows) can anchor with its own DOM contract.
 */
export type FeedScrollAnchor = {
  key: string;
  /** Viewport offset of the row under the scroll root at capture. */
  top: number;
  /**
   * `scrollTop` at capture. Live captures set it so a scroll between
   * capture and restore is not treated as layout shift. A session
   * back-nav anchor omits it: the scroller is not on that line yet, and
   * the row move itself is the landing.
   */
  scrollTop?: number;
};

/**
 * Layout-only scroll correction. Scrolling down by N moves the row up by N,
 * so the intervening scroll is subtracted from the observed row move
 * (`rowDelta + (scrollNow - scrollThen)`). No captured scroll means the
 * whole row move is layout (back-nav).
 */
export function feedAnchorLayoutDelta(
  rowDelta: number,
  scrollTopNow: number,
  scrollTopThen: number | undefined
): number {
  if (typeof scrollTopThen !== 'number' || !Number.isFinite(scrollTopThen)) {
    return rowDelta;
  }
  if (!Number.isFinite(scrollTopNow)) return rowDelta;
  return rowDelta + (scrollTopNow - scrollTopThen);
}

/** How to find anchor-eligible rows and read their stable keys. */
export type FeedAnchorQuery = {
  /** Rows eligible as anchors, matched in document order. */
  rowSelector: string;
  /** Stable key for a row element; undefined skips the row. */
  rowKey: (el: HTMLElement) => string | undefined;
  /** Single-row lookup selector for a captured key. */
  rowSelectorForKey: (key: string) => string;
};

/** Feed blocks — `.home-feed-block[data-feed-key]` in the home list. */
export const FEED_ANCHOR_QUERY: FeedAnchorQuery = {
  rowSelector: '.home-feed-block[data-feed-key]',
  rowKey: (el) => el.dataset.feedKey,
  rowSelectorForKey: (key) =>
    `.home-feed-block[data-feed-key="${CSS.escape(key)}"]`,
};

/**
 * Thread panel rows — ancestors, reply posts, and fold coils carry
 * `[data-thread-focus-key]` (postKey or `more-*`), so the same attribute
 * that drives deep-link focus can hold the reader's place while heights
 * settle.
 */
export const THREAD_ANCHOR_QUERY: FeedAnchorQuery = {
  rowSelector: '[data-thread-focus-key]',
  rowKey: (el) => el.dataset.threadFocusKey,
  rowSelectorForKey: (key) => `[data-thread-focus-key="${CSS.escape(key)}"]`,
};

/**
 * Notification activity rows — every day rule and item wrapper carries
 * `[data-notification-key]` (notificationRowKey).
 */
export const NOTIFICATION_ANCHOR_QUERY: FeedAnchorQuery = {
  rowSelector: '[data-notification-key]',
  rowKey: (el) => el.dataset.notificationKey,
  rowSelectorForKey: (key) => `[data-notification-key="${CSS.escape(key)}"]`,
};

/**
 * DM thread rows — every day rule and bubble carries `[data-dm-row-key]`
 * (dmThreadRowKey), so height corrections hold the reader's place in a
 * bottom-pinned conversation.
 */
export const DM_ANCHOR_QUERY: FeedAnchorQuery = {
  rowSelector: '[data-dm-row-key]',
  rowKey: (el) => el.dataset.dmRowKey,
  rowSelectorForKey: (key) => `[data-dm-row-key="${CSS.escape(key)}"]`,
};

/**
 * DM inbox rows — every conversation wrapper carries
 * `[data-inbox-thread-key]` (threadId), shared by the main list, search
 * results, and the sealed archive.
 */
export const MESSAGES_INBOX_ANCHOR_QUERY: FeedAnchorQuery = {
  rowSelector: '[data-inbox-thread-key]',
  rowKey: (el) => el.dataset.inboxThreadKey,
  rowSelectorForKey: (key) => `[data-inbox-thread-key="${CSS.escape(key)}"]`,
};

/**
 * Catalog rows — every windowed listing wrapper carries `[data-catalog-key]`
 * (marketListingRowKey, collectionId, or tokenId), shared by market, drops,
 * events, series, hub, and vault lists.
 */
export const CATALOG_ANCHOR_QUERY: FeedAnchorQuery = {
  rowSelector: '[data-catalog-key]',
  rowKey: (el) => el.dataset.catalogKey,
  rowSelectorForKey: (key) => `[data-catalog-key="${CSS.escape(key)}"]`,
};

/**
 * Standing / social rows — every wrapper in ProfileSocialList carries
 * `[data-standing-key]` (accountId), shared by discover profiles/search,
 * standing panels, and the recommended peek.
 */
export const STANDING_ANCHOR_QUERY: FeedAnchorQuery = {
  rowSelector: '[data-standing-key]',
  rowKey: (el) => el.dataset.standingKey,
  rowSelectorForKey: (key) => `[data-standing-key="${CSS.escape(key)}"]`,
};

/**
 * Secondary infinite lists — every windowed wrapper carries
 * `[data-secondary-key]`, shared by leaderboard tracks, endorsements,
 * DAO proposals, discover guild/DAO/article rows, and quotes/reposters.
 */
export const SECONDARY_ANCHOR_QUERY: FeedAnchorQuery = {
  rowSelector: '[data-secondary-key]',
  rowKey: (el) => el.dataset.secondaryKey,
  rowSelectorForKey: (key) => `[data-secondary-key="${CSS.escape(key)}"]`,
};

/**
 * True when a list mutation can move painted rows under the viewport and
 * must capture/restore a scroll anchor in the same turn as `setPosts`.
 */
export function feedListMutationNeedsScrollAnchor(input: {
  removedKeys?: readonly string[];
  updatedKeys?: readonly string[];
  reordered?: boolean;
  droppedHead?: boolean;
}): boolean {
  if (input.reordered) return true;
  if (input.droppedHead) return true;
  if (input.removedKeys != null && input.removedKeys.length > 0) return true;
  if (input.updatedKeys != null && input.updatedKeys.length > 0) return true;
  return false;
}

/** First row whose bottom edge is still inside the scroll root. */
export function captureVisibleFeedAnchor(
  root: HTMLElement | null,
  query: FeedAnchorQuery = FEED_ANCHOR_QUERY
): FeedScrollAnchor | null {
  if (!root) return null;
  const rootTop = root.getBoundingClientRect().top;
  for (const block of root.querySelectorAll<HTMLElement>(query.rowSelector)) {
    const rect = block.getBoundingClientRect();
    if (rect.bottom > rootTop + 1) {
      const key = query.rowKey(block);
      if (key) {
        return { key, top: rect.top - rootTop, scrollTop: root.scrollTop };
      }
    }
  }
  return null;
}

/**
 * Scroll so the anchored row sits at its captured viewport offset.
 * Returns false when the row is not mounted yet (caller may retry after pin).
 */
export function restoreFeedAnchor(
  root: HTMLElement | null,
  anchor: FeedScrollAnchor,
  query: FeedAnchorQuery = FEED_ANCHOR_QUERY
): boolean {
  if (!root) return false;
  const block = root.querySelector<HTMLElement>(
    query.rowSelectorForKey(anchor.key)
  );
  if (!block) return false;
  const rowDelta =
    block.getBoundingClientRect().top -
    root.getBoundingClientRect().top -
    anchor.top;
  const delta = feedAnchorLayoutDelta(
    rowDelta,
    root.scrollTop,
    anchor.scrollTop
  );
  if (Math.abs(delta) <= 1) return true;
  shiftAppLenisScroll(root, delta);
  return true;
}
