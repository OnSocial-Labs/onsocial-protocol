'use client';

import { useEffect, useState, type RefObject } from 'react';

export const DOCK_HIDE_DELTA_PX = 14;
export const DOCK_SHOW_DELTA_PX = 8;
export const DOCK_TOP_REVEAL_PX = 48;

type ScrollRootInput = Element | RefObject<Element | null> | null;

function scrollTopOf(target: EventTarget | null): number | null {
  if (target instanceof Element) return target.scrollTop;
  if (target instanceof Document) {
    return target.scrollingElement?.scrollTop ?? null;
  }
  return null;
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
 * - Pass `scrollRoot` Element or RefObject to scope to a scroller (page drawer /
 *   Discover overlay body). Refs are re-read on each scroll so late attach works.
 * - Pass `pinned` while commit chrome is up so save/refresh scroll cannot tuck
 *   the dock away.
 * - Bump `hideRequest` to force a hide (e.g. after a section jump).
 */
export function useDockAutoHide(
  pinned = false,
  scrollRoot: ScrollRootInput = null,
  hideRequest = 0
): boolean {
  const [hidden, setHidden] = useState(false);
  const usesRef = isScrollRootRef(scrollRoot);
  const boundElement = usesRef ? null : scrollRoot;

  // Clear scroll-hide when commit chrome pins the dock (render-time adjust).
  if (pinned && hidden) {
    setHidden(false);
  }

  useEffect(() => {
    if (hideRequest > 0 && !pinned) {
      queueMicrotask(() => {
        setHidden(true);
      });
    }
  }, [hideRequest, pinned]);

  useEffect(() => {
    if (pinned || !boundElement) {
      return;
    }

    let lastTop = boundElement.scrollTop;

    const onScroll = (event: Event) => {
      if (event.target !== boundElement) return;
      const top = boundElement.scrollTop;
      const last = lastTop;
      lastTop = top;
      const delta = top - last;
      if (top <= DOCK_TOP_REVEAL_PX || delta < -DOCK_SHOW_DELTA_PX) {
        setHidden(false);
      } else if (delta > DOCK_HIDE_DELTA_PX) {
        setHidden(true);
      }
    };

    boundElement.addEventListener('scroll', onScroll, {
      passive: true,
      capture: true,
    });
    return () => {
      boundElement.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [pinned, boundElement]);

  useEffect(() => {
    if (pinned || boundElement) {
      return;
    }

    const lastTops = new WeakMap<EventTarget, number>();
    const rootRef = usesRef ? scrollRoot : null;

    const onScroll = (event: Event) => {
      const target = event.target;
      if (!target) return;

      const scopedRoot = rootRef ? resolveScrollRoot(rootRef) : null;
      if (scopedRoot && target !== scopedRoot) return;

      const top = scrollTopOf(target);
      if (top == null) return;

      const last = lastTops.get(target);
      lastTops.set(target, top);
      if (last === undefined) return;

      const delta = top - last;
      if (top <= DOCK_TOP_REVEAL_PX || delta < -DOCK_SHOW_DELTA_PX) {
        setHidden(false);
      } else if (delta > DOCK_HIDE_DELTA_PX) {
        setHidden(true);
      }
    };

    window.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [pinned, boundElement, usesRef, scrollRoot]);

  return pinned ? false : hidden;
}
