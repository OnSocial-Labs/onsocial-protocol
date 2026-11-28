import { APP_HOME_PATH } from '@/lib/app-routes';

/**
 * History for a layer opened while another is still closing.
 * The Back may already have popped the overlay entry, or that pop may still
 * be queued. The canonical href keeps its query (`?tab=`, `?t=`).
 */

export function withoutClosingLayer<T extends { id: string }>(
  stack: readonly T[],
  closingId: string | null
): T[] {
  if (!closingId) return stack as T[];
  let removed = false;
  const live: T[] = [];
  for (const entry of stack) {
    if (entry.id === closingId) {
      removed = true;
      continue;
    }
    live.push(entry);
  }
  return removed ? live : (stack as T[]);
}

/**
 * First drop open over a real underlay page → history push so browser Back
 * and dock Back both dismiss the sheet. Open from home (app root) → replace;
 * there is no underlay entry worth returning to, so open/close must not stack.
 * Uses native history only — App Router push would remount and kill the feed.
 */
export function dropLayerOpenHistoryOp(
  underlayPath: string
): 'push' | 'replace' {
  const path = underlayPath.split(/[?#]/)[0] ?? '';
  if (path === APP_HOME_PATH || path === '' || path === '/') {
    return 'replace';
  }
  return 'push';
}

export type OverlayHistoryOp = 'push' | 'replace' | 'none';

export function repairClosingLayerHistory(input: {
  canonical: string;
  currentUrl: string;
  /** The overlay flag is still on the current history entry. */
  historyHasLayer: boolean;
}): { op: OverlayHistoryOp; href: string } {
  if (!input.historyHasLayer) {
    return { op: 'push', href: input.canonical };
  }
  if (input.currentUrl !== input.canonical) {
    return { op: 'replace', href: input.canonical };
  }
  return { op: 'none', href: input.canonical };
}

/**
 * A close's `history.back()` whose popstate has not landed yet.
 * Swallow it when the closing layer was already replaced, and push the
 * canonical again if that pop ate the entry. The href is the canonical,
 * not a path rebuilt without its query.
 */
export function inFlightPopRepair(input: {
  pendingClosePop: boolean;
  closingId: string | null;
  stackLength: number;
  historyHasLayer: boolean;
  canonical: string | null;
}): { swallow: boolean; pushHref: string | null } {
  if (
    !input.pendingClosePop ||
    input.closingId != null ||
    input.stackLength === 0
  ) {
    return { swallow: false, pushHref: null };
  }
  return {
    swallow: true,
    pushHref:
      input.historyHasLayer || !input.canonical ? null : input.canonical,
  };
}

/**
 * Arm the pending flag only when this Back will reach `onPop`.
 * Depth 0 returns before `onPop`, so a flag set here would stay true and
 * swallow a later Back.
 */
export function beginHistoryBack(input: {
  depth: number;
  historyHasLayer: boolean;
}): { back: boolean; armPending: boolean } {
  if (!input.historyHasLayer) {
    return { back: false, armPending: false };
  }
  return { back: true, armPending: input.depth > 0 };
}
