/**
 * One history writer for the place stack (posts, quotes, drops).
 * Native History only — App Router push remounts the underlay and kills the feed.
 * Each opened screen is its own entry. One Back closes only the top screen.
 * Pushes go through `History.prototype` so `browser-path` subscribers stay quiet.
 */

const PLACE_LAYER_STATE_KEY = 'onsocialPostLayer';
const PLACE_LAYER_DEPTH_KEY = 'onsocialPostLayerDepth';
const PLACE_LAYER_GUARD_KEY = '__onsocialPostLayerPopGuard';

/** A `history.go` that never pops must not leave Back and opens stuck. */
export const PLACE_HISTORY_JUMP_TIMEOUT_MS = 1000;

export type OverlayHistoryOp = 'push' | 'replace' | 'none';

export type PlaceHistoryGuard = {
  /** Overlay entries above the underlay. 0 means this popstate is not ours. */
  depth: number;
  onPop: () => void;
  /**
   * Dock / in-app Back. False when no screen is open or this call closed nothing,
   * so the caller can still leave the page.
   */
  closeTop: () => boolean;
  /** Next popstate rewrites history. It is not a user Back. */
  suppressPops: number;
  /** `history.go` already sent for this jump and not yet popped. */
  issuedDelta: number;
  /** How far this jump has already moved. Callers still see the start depth. */
  consumedDelta: number;
  /** Latest requested move from the depth where this jump started. */
  wantedDelta: number;
  /** Runs once `wantedDelta` has landed. A newer rewrite replaces it. */
  afterJump: (() => void) | null;
  /** push/replace that arrived while a jump was in flight. */
  writesAfterJump: Array<() => void>;
  /** Clears a jump whose popstate never arrives. */
  jumpTimer: ReturnType<typeof setTimeout> | null;
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
      closeTop: () => false,
      suppressPops: 0,
      issuedDelta: 0,
      consumedDelta: 0,
      wantedDelta: 0,
      afterJump: null,
      writesAfterJump: [],
      jumpTimer: null,
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
            clearPlaceJumpTimer(guard!);
            settlePlaceHistoryPop(guard!);
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

/** In-app Back closes one open place screen. False when nothing was open or closed. */
export function closePlaceLayerIfOpen(): boolean {
  if (typeof window === 'undefined') return false;
  return getPlaceHistoryGuard().closeTop();
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

function deferPlaceWrite(run: () => void): boolean {
  const guard = getPlaceHistoryGuard();
  if (guard.suppressPops <= 0) return false;
  guard.writesAfterJump.push(run);
  return true;
}

export function pushPlaceLayer(href: string): void {
  if (deferPlaceWrite(() => pushPlaceLayer(href))) return;
  const guard = getPlaceHistoryGuard();
  const next = guard.depth + 1;
  nativeHistoryPushState(withPlaceLayerHistoryState(next), href);
  guard.depth = next;
}

export function replacePlaceLayer(href: string): void {
  if (deferPlaceWrite(() => replacePlaceLayer(href))) return;
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

/** Push an overlay entry at an exact depth. Waits out an in-flight jump. */
export function pushPlaceLayerAt(href: string, depth: number): void {
  if (deferPlaceWrite(() => pushPlaceLayerAt(href, depth))) return;
  const guard = getPlaceHistoryGuard();
  nativeHistoryPushState(withPlaceLayerHistoryState(depth), href);
  guard.depth = depth;
}

/** Relabel the current overlay entry at an exact depth. Waits out an in-flight jump. */
export function replacePlaceLayerAt(href: string, depth: number): void {
  if (deferPlaceWrite(() => replacePlaceLayerAt(href, depth))) return;
  const guard = getPlaceHistoryGuard();
  nativeHistoryReplaceState(withPlaceLayerHistoryState(depth), href);
  guard.depth = depth;
}

/** Remember overlay depth. Waits out an in-flight jump so a later go uses the landing depth. */
export function setPlaceLayerDepth(depth: number): void {
  if (deferPlaceWrite(() => setPlaceLayerDepth(depth))) return;
  getPlaceHistoryGuard().depth = depth;
}

/** Drop the overlay flag and return history to the underlay. Waits out an in-flight jump. */
export function clearPlaceLayer(href: string): void {
  if (deferPlaceWrite(() => clearPlaceLayer(href))) return;
  const guard = getPlaceHistoryGuard();
  nativeHistoryReplaceState(withoutPlaceLayerHistoryState(), href);
  guard.depth = 0;
}

function clearPlaceJumpTimer(guard: PlaceHistoryGuard): void {
  if (guard.jumpTimer == null) return;
  clearTimeout(guard.jumpTimer);
  guard.jumpTimer = null;
}

function armPlaceJumpTimer(guard: PlaceHistoryGuard): void {
  clearPlaceJumpTimer(guard);
  guard.jumpTimer = setTimeout(() => {
    guard.jumpTimer = null;
    if (guard.suppressPops <= 0) return;
    guard.suppressPops = 0;
    guard.issuedDelta = 0;
    guard.consumedDelta = 0;
    finishPlaceHistoryJump(guard);
  }, PLACE_HISTORY_JUMP_TIMEOUT_MS);
}

/**
 * Steps we can actually pop. Overlay depth is the stack we pushed.
 * `history.length` stops a reload or deep link from going past the session.
 * Null means this environment did not say, so the caller's delta stands.
 */
function overlayBackCeiling(depth: number): number | null {
  const length = window.history.length;
  const fromSession =
    typeof length === 'number' && length >= 1 ? Math.max(length - 1, 0) : null;
  const fromDepth = depth > 0 ? depth : null;
  if (fromSession == null) return fromDepth;
  if (fromDepth == null) return fromSession;
  return Math.min(fromSession, fromDepth);
}

/**
 * Finish a jump, then run push/replace that waited for the landing entry.
 * If `apply` starts another jump, those writes wait for that one too.
 */
function finishPlaceHistoryJump(guard: PlaceHistoryGuard): void {
  clearPlaceJumpTimer(guard);
  const apply = guard.afterJump;
  const queued = guard.writesAfterJump.splice(0);
  guard.afterJump = null;
  guard.wantedDelta = 0;
  guard.consumedDelta = 0;
  guard.issuedDelta = 0;
  apply?.();
  if (guard.suppressPops > 0) {
    guard.writesAfterJump.push(...queued);
    return;
  }
  for (const run of queued) run();
}

/** One pop of an in-flight `history.go`. Issue whatever distance is still owed. */
function settlePlaceHistoryPop(guard: PlaceHistoryGuard): void {
  guard.consumedDelta += guard.issuedDelta;
  guard.issuedDelta = 0;
  const rest = guard.wantedDelta - guard.consumedDelta;
  const continueJump =
    rest !== 0 &&
    Math.sign(rest) === Math.sign(guard.wantedDelta) &&
    Math.abs(guard.consumedDelta) < Math.abs(guard.wantedDelta);
  if (continueJump) {
    guard.issuedDelta = rest;
    guard.suppressPops = 1;
    armPlaceJumpTimer(guard);
    window.history.go(rest);
    return;
  }
  finishPlaceHistoryJump(guard);
}

/**
 * One in-flight `history.go`. A later rewrite replaces the apply step.
 * A longer jump in the same direction is issued when this pop lands —
 * a second `go` from the same entry would walk past the underlay.
 * push/replace wait until the full jump has landed so they label that entry.
 */
export function schedulePlaceHistoryGo(delta: number, apply: () => void): void {
  const guard = getPlaceHistoryGuard();
  const ceiling = overlayBackCeiling(guard.depth);
  const capped =
    delta < 0 && ceiling != null ? Math.max(delta, -ceiling) : delta;
  guard.afterJump = apply;
  guard.wantedDelta = capped;
  if (guard.suppressPops > 0) return;
  if (capped === 0) {
    finishPlaceHistoryJump(guard);
    return;
  }
  guard.consumedDelta = 0;
  guard.issuedDelta = capped;
  guard.suppressPops = 1;
  armPlaceJumpTimer(guard);
  window.history.go(capped);
}

/**
 * History depth matches the mounted stack. Extra entries pop once
 * (`history.go`) without `onPop`, then the landing entry takes `href`.
 */
export function alignPlaceHistory(nextDepth: number, href: string): void {
  const guard = getPlaceHistoryGuard();
  if (nextDepth <= 0) {
    const extra = guard.depth;
    if (extra > 0) {
      schedulePlaceHistoryGo(-extra, () => {
        guard.depth = 0;
      });
      return;
    }
    guard.depth = 0;
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
 * A reload keeps the overlay flag on a copy of the page (`/home` over `/home`).
 * The stack is gone, so the first Back looks like it did nothing.
 * A live stack (`liveDepth > 0`) and a real post or drop URL stay put.
 */
export function reloadedPlaceEntryRepair(input: {
  hasLayer: boolean;
  overlayPath: boolean;
  liveDepth: number;
  storedDepth: number;
  historyLength: number | null;
}): 'back' | 'strip' | 'keep' {
  if (!input.hasLayer || input.overlayPath || input.liveDepth > 0)
    return 'keep';
  const fromSession =
    input.historyLength != null && input.historyLength >= 1
      ? Math.max(input.historyLength - 1, 0)
      : null;
  const fromDepth = input.storedDepth > 0 ? input.storedDepth : 1;
  const ceiling =
    fromSession == null ? fromDepth : Math.min(fromSession, fromDepth);
  if (ceiling < 1) return 'strip';
  return 'back';
}

/**
 * Boot repair for a reloaded feed Read. One step through the jump guard,
 * or strip the flag when there is nowhere to go. Not a user Back.
 */
export function stepOverReloadedPlaceEntry(
  overlayPath: boolean
): 'back' | 'strip' | 'keep' {
  if (typeof window === 'undefined') return 'keep';
  const guard = getPlaceHistoryGuard();
  const repair = reloadedPlaceEntryRepair({
    hasLayer: historyHasPlaceLayer(),
    overlayPath,
    liveDepth: guard.depth,
    storedDepth: readPlaceLayerDepth(),
    historyLength:
      typeof window.history.length === 'number' ? window.history.length : null,
  });
  if (repair === 'strip') {
    nativeHistoryReplaceState(
      withoutPlaceLayerHistoryState(),
      `${window.location.pathname}${window.location.search}`
    );
    guard.depth = 0;
    return repair;
  }
  if (repair === 'back') {
    guard.depth = readPlaceLayerDepth();
    schedulePlaceHistoryGo(-1, () => {
      guard.depth = 0;
    });
  }
  return repair;
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

/**
 * Header Back finishes the exit slide, then `history.back()`, then
 * sheet-closed in the same turn. Zeroing depth before that popstate lands
 * lets App Router see the pop and leave the underlay (about:blank in e2e).
 * Keep depth until `onPop` when a close pop is still pending.
 */
export function shouldZeroPlaceDepthOnSheetClosed(
  closePopPending: boolean
): boolean {
  return !closePopPending;
}
