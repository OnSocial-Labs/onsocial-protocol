'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

export const DOCK_HIDE_DELTA_PX = 14;
export const DOCK_SHOW_DELTA_PX = 8;
export const DOCK_TOP_REVEAL_PX = 48;
/** Ignore scroll deltas briefly after a hide/show flip (layout/animation settle). */
export const DOCK_TOGGLE_COOLDOWN_MS = 280;
/**
 * Don’t tuck the dock unless the scroller has enough travel to bring it back.
 * Short pages / overscroll used to hide it with no way to reveal.
 */
export const DOCK_MIN_SCROLL_ROOM_PX = DOCK_TOP_REVEAL_PX + DOCK_HIDE_DELTA_PX;

type ScrollRootInput = Element | RefObject<Element | null> | null;

function scrollTopOf(target: EventTarget | null): number | null {
  if (target instanceof Element) return target.scrollTop;
  if (target instanceof Document) {
    return target.scrollingElement?.scrollTop ?? null;
  }
  return null;
}

function scrollElementOf(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Document) {
    return target.scrollingElement ?? null;
  }
  return null;
}

/** How far this scroller can move (0 = no overflow / short page). */
export function scrollRoomOf(el: Element | null): number {
  if (!el) return 0;
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

/** True when hiding would strand the dock (can’t scroll up enough to reveal). */
export function canDockAutoHide(scrollRoomPx: number): boolean {
  return scrollRoomPx >= DOCK_MIN_SCROLL_ROOM_PX;
}

/** A flick large enough to hide or show. Smaller moves are layout settle. */
export function isDockFlick(delta: number): boolean {
  return delta < -DOCK_SHOW_DELTA_PX || delta > DOCK_HIDE_DELTA_PX;
}

/** `element` listens to that node. `subtree` also listens to scrollers inside it. */
export type DockScrollListen = 'element' | 'subtree';

/**
 * True when this scroll belongs to the top screen. A covered screen's
 * scroller must not tuck the dock.
 */
export function scrollBelongsToDockRoot(
  root: Element,
  target: EventTarget | null,
  listen: DockScrollListen
): boolean {
  const el = scrollElementOf(target);
  if (!el) return false;
  if (el === root) return true;
  return listen === 'subtree' && root.contains(el);
}

/**
 * Opening or closing the top screen shows the dock. The tuck belongs to
 * the screen that is on top now, not the one that just left.
 */
export function dockHiddenForScrollRoot(args: {
  hidden: boolean;
  rootChanged: boolean;
}): boolean {
  if (args.rootChanged) return false;
  return args.hidden;
}

/**
 * Settle cooldown blocks tiny follow-up deltas. A real flick still toggles,
 * so scrolling back up reveals the chrome without waiting out the timer.
 */
export function dockToggleCooling(args: {
  delta: number;
  now: number;
  cooldownUntil: number;
}): boolean {
  if (isDockFlick(args.delta)) return false;
  return args.delta !== 0 && args.now < args.cooldownUntil;
}

/**
 * Next tuck state for one scroll event. Near the top, or on a short page,
 * the chrome stays visible. Otherwise hide on a downward flick and show
 * on an upward one.
 */
export function nextDockAutoHidden(args: {
  scrollTop: number;
  delta: number;
  scrollRoom: number;
  hidden: boolean;
}): boolean {
  if (
    !canDockAutoHide(args.scrollRoom) ||
    args.scrollTop <= DOCK_TOP_REVEAL_PX ||
    args.delta < -DOCK_SHOW_DELTA_PX
  ) {
    return false;
  }
  if (args.delta > DOCK_HIDE_DELTA_PX) return true;
  return args.hidden;
}

function isScrollRootRef(
  value: ScrollRootInput
): value is RefObject<Element | null> {
  if (typeof value !== 'object' || value === null || !('current' in value)) {
    return false;
  }
  // `Element` is browser-only — skip instanceof during SSR.
  if (typeof Element !== 'undefined' && value instanceof Element) {
    return false;
  }
  return true;
}

function resolveScrollRoot(input: ScrollRootInput): Element | null {
  if (!input) return null;
  if (isScrollRootRef(input)) return input.current;
  return input;
}

/**
 * Dock auto-hide: hide on scroll down, reveal on scroll up or near the top.
 *
 * - Default: window capture so nested scrollers (`.os-app-screen-body`) count.
 * - Pass `scrollRoot` Element or RefObject to scope to the top screen. Refs are
 *   re-read on each scroll so late attach works. `subtree` also counts scrollers
 *   inside that screen; `element` counts only the node itself.
 * - Changing `scrollRoot` shows the dock once. The new screen's scroll decides
 *   the next tuck, so closing Read does not leave the pill hidden.
 * - Pass `pinned` while commit chrome is up so save/refresh scroll cannot tuck
 *   the dock away.
 * - Bump `hideRequest` to force a hide (e.g. after a section jump).
 * - Bump `revealRequest` to show once (e.g. drop/post sheet open) without
 *   pinning — scroll-hide still folds after that, same as other pages.
 * - Short / non-scrollable surfaces never stay hidden (no scroll room to reveal).
 */
export function useDockAutoHide(
  pinned = false,
  scrollRoot: ScrollRootInput = null,
  hideRequest = 0,
  revealRequest = 0,
  listen: DockScrollListen = 'element'
): boolean {
  const [hidden, setHidden] = useState(false);
  const cooldownUntilRef = useRef(0);
  const usesRef = isScrollRootRef(scrollRoot);
  const boundElement = usesRef ? null : scrollRoot;
  const [trackedRoot, setTrackedRoot] = useState<Element | null>(boundElement);

  // Clear scroll-hide when commit chrome pins the dock (render-time adjust).
  if (pinned && hidden) {
    setHidden(false);
  }

  // A new top screen shows the dock. Its own scroll can tuck it again.
  if (boundElement !== trackedRoot) {
    setTrackedRoot(boundElement);
    if (dockHiddenForScrollRoot({ hidden, rootChanged: true }) !== hidden) {
      setHidden(false);
    }
  }

  useEffect(() => {
    if (hideRequest > 0 && !pinned) {
      queueMicrotask(() => {
        // Section jumps only tuck when the surface can scroll it back.
        const root =
          boundElement ??
          (typeof document !== 'undefined'
            ? document.querySelector('.os-app-screen-body')
            : null);
        if (root && !canDockAutoHide(scrollRoomOf(root))) {
          setHidden(false);
          return;
        }
        setHidden(true);
      });
    }
  }, [hideRequest, pinned, boundElement]);

  useEffect(() => {
    if (revealRequest > 0) {
      queueMicrotask(() => setHidden(false));
    }
  }, [revealRequest]);

  useEffect(() => {
    if (pinned || !boundElement) {
      return;
    }

    const lastTops = new WeakMap<EventTarget, number>();
    if (listen === 'element') {
      lastTops.set(boundElement, boundElement.scrollTop);
    }

    const applyHidden = (next: boolean) => {
      const now = performance.now();
      if (now < cooldownUntilRef.current) return;
      setHidden((current) => {
        if (current === next) return current;
        cooldownUntilRef.current = now + DOCK_TOGGLE_COOLDOWN_MS;
        return next;
      });
    };

    const revealIfShort = () => {
      if (!canDockAutoHide(scrollRoomOf(boundElement))) {
        applyHidden(false);
      }
    };

    const onScroll = (event: Event) => {
      if (!scrollBelongsToDockRoot(boundElement, event.target, listen)) return;
      const el = scrollElementOf(event.target);
      if (!el) return;
      const top = el.scrollTop;
      const last = lastTops.get(el);
      lastTops.set(el, top);
      if (last === undefined) return;
      const delta = top - last;
      const room = scrollRoomOf(el);
      if (
        !canDockAutoHide(room) ||
        top <= DOCK_TOP_REVEAL_PX ||
        delta < -DOCK_SHOW_DELTA_PX
      ) {
        applyHidden(false);
      } else if (delta > DOCK_HIDE_DELTA_PX) {
        applyHidden(true);
      }
    };

    boundElement.addEventListener('scroll', onScroll, {
      passive: true,
      capture: true,
    });
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            revealIfShort();
          })
        : null;
    ro?.observe(boundElement);
    revealIfShort();
    return () => {
      boundElement.removeEventListener('scroll', onScroll, { capture: true });
      ro?.disconnect();
    };
  }, [pinned, boundElement, listen]);

  useEffect(() => {
    if (pinned || boundElement) {
      return;
    }

    const lastTops = new WeakMap<EventTarget, number>();
    const rootRef = usesRef ? scrollRoot : null;

    const applyHidden = (next: boolean) => {
      const now = performance.now();
      if (now < cooldownUntilRef.current) return;
      setHidden((current) => {
        if (current === next) return current;
        cooldownUntilRef.current = now + DOCK_TOGGLE_COOLDOWN_MS;
        return next;
      });
    };

    const onScroll = (event: Event) => {
      const target = event.target;
      if (!target) return;

      const scopedRoot = rootRef ? resolveScrollRoot(rootRef) : null;
      if (scopedRoot && target !== scopedRoot) return;

      const el = scrollElementOf(target);
      const top = scrollTopOf(target);
      if (top == null || !el) return;

      const last = lastTops.get(target);
      lastTops.set(target, top);
      if (last === undefined) return;

      const delta = top - last;
      const room = scrollRoomOf(el);
      if (
        !canDockAutoHide(room) ||
        top <= DOCK_TOP_REVEAL_PX ||
        delta < -DOCK_SHOW_DELTA_PX
      ) {
        applyHidden(false);
      } else if (delta > DOCK_HIDE_DELTA_PX) {
        applyHidden(true);
      }
    };

    window.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    });

    const screenBody =
      typeof document !== 'undefined'
        ? document.querySelector('.os-app-screen-body')
        : null;
    const ro =
      typeof ResizeObserver !== 'undefined' && screenBody
        ? new ResizeObserver(() => {
            if (!canDockAutoHide(scrollRoomOf(screenBody))) {
              applyHidden(false);
            }
          })
        : null;
    if (screenBody) ro?.observe(screenBody);

    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      ro?.disconnect();
    };
  }, [pinned, boundElement, usesRef, scrollRoot]);

  return pinned ? false : hidden;
}
