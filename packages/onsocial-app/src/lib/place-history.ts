/**
 * One history writer for the place stack (posts, quotes, drops).
 * Native History only — App Router push remounts the underlay and kills the feed.
 * Each opened screen is its own entry. One Back closes only the top screen.
 * Pushes go through `History.prototype` so `browser-path` subscribers stay quiet.
 */

const PLACE_LAYER_STATE_KEY = 'onsocialPostLayer';
const PLACE_LAYER_DEPTH_KEY = 'onsocialPostLayerDepth';
const PLACE_LAYER_GUARD_KEY = '__onsocialPostLayerPopGuard';

export type OverlayHistoryOp = 'push' | 'replace' | 'none';

export type PlaceHistoryGuard = {
  /** Overlay entries above the underlay. 0 means this popstate is not ours. */
  depth: number;
  onPop: () => void;
  /** Dock / in-app Back while a place screen is open. */
  closeTop: () => void;
  /** Next popstate rewrites history. It is not a user Back. */
  suppressPops: number;
  afterSuppress: (() => void) | null;
};

type GuardWindow = Window & {
  [PLACE_LAYER_GUARD_KEY]?: PlaceHistoryGuard;
};

export function getPlaceHistoryGuard(): PlaceHistoryGuard {
  const w = window as GuardWindow;
  let guard = w[PLACE_LAYER_GUARD_KEY];
  if (!guard) {
    guard = {
      depth: 0,
      onPop: () => {},
      closeTop: () => {},
      suppressPops: 0,
      afterSuppress: null,
    };
    w[PLACE_LAYER_GUARD_KEY] = guard;
    window.addEventListener(
      'popstate',
      (event) => {
        if (guard!.suppressPops > 0) {
          event.stopImmediatePropagation();
          event.stopPropagation();
          guard!.suppressPops -= 1;
          if (guard!.suppressPops === 0) {
            const done = guard!.afterSuppress;
            guard!.afterSuppress = null;
            done?.();
          }
          return;
        }
        if (guard!.depth <= 0) return;
        event.stopImmediatePropagation();
        event.stopPropagation();
        guard!.onPop();
      },
      true
    );
  }
  return guard;
}

/** In-app Back closes the place screen when one is open. Otherwise the caller decides. */
export function closePlaceLayerIfOpen(): boolean {
  if (typeof window === 'undefined') return false;
  const guard = getPlaceHistoryGuard();
  if (guard.depth <= 0) return false;
  guard.closeTop();
  return true;
}

export function nativeHistoryPushState(state: object, url: string): void {
  History.prototype.pushState.call(window.history, state, '', url);
}

export function nativeHistoryReplaceState(state: object, url: string): void {
  History.prototype.replaceState.call(window.history, state, '', url);
}

export function historyHasPlaceLayer(): boolean {
  if (typeof window === 'undefined') return false;
  const state = window.history.state;
  return Boolean(
    state &&
      typeof state === 'object' &&
      (state as { [PLACE_LAYER_STATE_KEY]?: unknown })[PLACE_LAYER_STATE_KEY]
  );
}

export function readPlaceLayerDepth(): number {
  if (!historyHasPlaceLayer()) return 0;
  const state = window.history.state as {
    [PLACE_LAYER_DEPTH_KEY]?: unknown;
  };
  const depth = state[PLACE_LAYER_DEPTH_KEY];
  return typeof depth === 'number' && depth > 0 ? depth : 1;
}

export function withPlaceLayerHistoryState(depth: number): object {
  const prev = typeof window === 'undefined' ? null : window.history.state;
  const base =
    prev && typeof prev === 'object' && !Array.isArray(prev)
      ? { ...(prev as Record<string, unknown>) }
      : {};
  return {
    ...base,
    // Next popstate hard-reloads when __NA is missing. Overlay entries copy
    // the underlay tree and never own a real App Router page.
    __NA: true,
    [PLACE_LAYER_STATE_KEY]: true,
    [PLACE_LAYER_DEPTH_KEY]: depth,
  };
}

export function withoutPlaceLayerHistoryState(): object {
  const prev = typeof window === 'undefined' ? null : window.history.state;
  const base =
    prev && typeof prev === 'object' && !Array.isArray(prev)
      ? { ...(prev as Record<string, unknown>) }
      : {};
  delete base[PLACE_LAYER_STATE_KEY];
  delete base[PLACE_LAYER_DEPTH_KEY];
  return base;
}

/**
 * Mounted trail is parent + top. A longer open slides that window:
 * push when the stack grows, slide when the parked parent changes,
 * replace when the same depth only changes URL.
 */
export function placeHistoryOpForTrail(input: {
  prevLength: number;
  nextLength: number;
  parentChanged: boolean;
}): 'push' | 'slide' | 'replace' {
  if (input.nextLength > input.prevLength) return 'push';
  if (input.nextLength >= 2 && input.parentChanged) return 'slide';
  return 'replace';
}

export function pushPlaceLayer(href: string): void {
  const guard = getPlaceHistoryGuard();
  const next = guard.depth + 1;
  nativeHistoryPushState(withPlaceLayerHistoryState(next), href);
  guard.depth = next;
}

export function replacePlaceLayer(href: string): void {
  const guard = getPlaceHistoryGuard();
  if (guard.depth <= 0) {
    pushPlaceLayer(href);
    return;
  }
  const current = `${window.location.pathname}${window.location.search}`;
  if (current !== href || !historyHasPlaceLayer()) {
    nativeHistoryReplaceState(withPlaceLayerHistoryState(guard.depth), href);
  }
}

/**
 * One in-flight `history.go`. A second rewrite before that pop lands
 * replaces the apply step and does not move again — two goes from the
 * same entry would walk past the underlay and leave the next Back swallowed.
 */
export function schedulePlaceHistoryGo(
  delta: number,
  apply: () => void
): void {
  const guard = getPlaceHistoryGuard();
  guard.afterSuppress = apply;
  if (guard.suppressPops > 0) return;
  guard.suppressPops = 1;
  window.history.go(delta);
}

/**
 * History depth matches the mounted stack. Extra entries pop once
 * (`history.go`) without `onPop`, then the landing entry takes `href`.
 */
export function alignPlaceHistory(nextDepth: number, href: string): void {
  const guard = getPlaceHistoryGuard();
  if (nextDepth <= 0) {
    const extra = guard.depth;
    guard.depth = 0;
    if (extra > 0) {
      schedulePlaceHistoryGo(-extra, () => {
        guard.depth = 0;
      });
    }
    return;
  }
  if (guard.depth <= 0) {
    pushPlaceLayer(href);
    return;
  }
  const delta = guard.depth - nextDepth;
  if (delta > 0) {
    schedulePlaceHistoryGo(-delta, () => {
      nativeHistoryReplaceState(withPlaceLayerHistoryState(nextDepth), href);
      guard.depth = nextDepth;
    });
    return;
  }
  if (delta < 0) {
    pushPlaceLayer(href);
    return;
  }
  replacePlaceLayer(href);
  guard.depth = nextDepth;
}

/**
 * Grandparent unmounted. History was [underlay, grandparent, parent].
 * Become [underlay, parent, top] so Back returns to the parked parent.
 */
export function slidePlaceHistory(parentHref: string, topHref: string): void {
  const guard = getPlaceHistoryGuard();
  if (guard.depth < 2) {
    pushPlaceLayer(topHref);
    return;
  }
  schedulePlaceHistoryGo(-1, () => {
    nativeHistoryReplaceState(withPlaceLayerHistoryState(1), parentHref);
    guard.depth = 1;
    pushPlaceLayer(topHref);
  });
}

export function applyPlaceTrailHistory(input: {
  prevLength: number;
  nextLength: number;
  parentChanged: boolean;
  parentHref: string;
  topHref: string;
}): void {
  const op = placeHistoryOpForTrail(input);
  if (op === 'push') {
    pushPlaceLayer(input.topHref);
    return;
  }
  if (op === 'slide') {
    slidePlaceHistory(input.parentHref, input.topHref);
    return;
  }
  replacePlaceLayer(input.topHref);
}

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
