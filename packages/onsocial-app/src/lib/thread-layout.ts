/**
 * Post detail body layout.
 *
 * `flow` (default) — replies stream below the divider; quotes live on their
 * own screen; empty threads show a discover peek instead of chrome.
 * `tabs` (legacy) — Replies | Quotes tab bar under the focus post.
 *
 * Switch with `?thread=flow|tabs` while we compare on device.
 */
export const THREAD_LAYOUT_QUERY = 'thread';

export type ThreadLayout = 'flow' | 'tabs';

export function resolveThreadLayout(
  searchParams: Pick<URLSearchParams, 'get'> | null
): ThreadLayout {
  return searchParams?.get(THREAD_LAYOUT_QUERY) === 'tabs' ? 'tabs' : 'flow';
}
