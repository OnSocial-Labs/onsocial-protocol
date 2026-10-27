/**
 * Scroll anchoring for in-place list re-ranks (Focus Hot append merges) and
 * for windowed-list height corrections. Capture the first painted row before
 * the mutation, then put it back at its viewport offset before paint so the
 * change is invisible. Row lookup is query-driven so any keyed list (feed
 * blocks, thread reply rows) can anchor with its own DOM contract.
 */
export type FeedScrollAnchor = { key: string; top: number };

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
 * Thread panel rows — every ancestor and reply item carries
 * `[data-thread-focus-key]` (postKey), so the same attribute that drives
 * deep-link focus can hold the reader's place while heights settle.
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
      if (key) return { key, top: rect.top - rootTop };
    }
  }
  return null;
}

/** Scroll so the anchored row sits at its captured viewport offset. */
export function restoreFeedAnchor(
  root: HTMLElement | null,
  anchor: FeedScrollAnchor,
  query: FeedAnchorQuery = FEED_ANCHOR_QUERY
): void {
  if (!root) return;
  const block = root.querySelector<HTMLElement>(
    query.rowSelectorForKey(anchor.key)
  );
  if (!block) return;
  const delta =
    block.getBoundingClientRect().top -
    root.getBoundingClientRect().top -
    anchor.top;
  if (Math.abs(delta) > 1) root.scrollTop += delta;
}
