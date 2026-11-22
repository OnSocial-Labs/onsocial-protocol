'use client';

import { useLayoutEffect, type RefObject } from 'react';
import {
  applyListScrollRestore,
  type ListScrollMemory,
} from '@/lib/list-scroll-restore';

const RESTORE_FRAMES = 90;
/** Lenis eases for about 1.5s after a wheel or drag. Follow that coast. */
const SCROLL_GESTURE_MS = 1800;

/** Keep applying the saved line until the scroller is actually there. */
export function useListScrollRestore(
  scrollRootRef: RefObject<Element | null> | undefined,
  memoryRef: RefObject<ListScrollMemory>,
  revision: unknown,
  enabled = true
): void {
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const node = scrollRootRef?.current;
    if (!(node instanceof HTMLElement)) return undefined;

    let frames = 0;
    let raf = 0;
    const attempt = () => {
      const memory = memoryRef.current;
      if (!memory || memory.userAdjusted) return;
      const pending = memory.pending;
      if (pending == null || pending <= 0) return;
      if (applyListScrollRestore(node, pending)) {
        memory.pending = null;
        memory.landed = node.scrollTop;
        return;
      }
      if (frames++ < RESTORE_FRAMES) {
        raf = requestAnimationFrame(attempt);
      }
    };
    attempt();

    let coastUntil = 0;
    let holdLine = false;
    const writeLine = () => {
      const memory = memoryRef.current;
      if (!memory) return;
      memory.userAdjusted = true;
      memory.pending = null;
      memory.landed = node.scrollTop;
      delete node.dataset.osScrollRestore;
    };
    const beginCoast = () => {
      holdLine = false;
      coastUntil = performance.now() + SCROLL_GESTURE_MS;
      writeLine();
    };
    const hold = () => {
      holdLine = true;
      coastUntil = 0;
      writeLine();
    };
    const remember = (event: Event) => {
      if (holdLine && !event.isTrusted) return;
      const coasting = performance.now() < coastUntil;
      if (!event.isTrusted && !coasting) return;
      writeLine();
    };
    node.addEventListener('wheel', beginCoast, { passive: true });
    node.addEventListener('touchmove', beginCoast, { passive: true });
    node.addEventListener('pointerdown', hold);
    node.addEventListener('keydown', beginCoast);
    node.addEventListener('scroll', remember, { passive: true });

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      node.removeEventListener('wheel', beginCoast);
      node.removeEventListener('touchmove', beginCoast);
      node.removeEventListener('pointerdown', hold);
      node.removeEventListener('keydown', beginCoast);
      node.removeEventListener('scroll', remember);
    };
  }, [enabled, memoryRef, revision, scrollRootRef]);
}
