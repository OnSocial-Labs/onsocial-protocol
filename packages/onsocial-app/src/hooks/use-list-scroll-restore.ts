'use client';

import { useLayoutEffect, type RefObject } from 'react';
import {
  applyListScrollRestore,
  type ListScrollMemory,
} from '@/lib/list-scroll-restore';

const RESTORE_FRAMES = 90;

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

    const markUser = () => {
      const memory = memoryRef.current;
      if (!memory) return;
      memory.userAdjusted = true;
      memory.pending = null;
      memory.landed = node.scrollTop;
      delete node.dataset.osScrollRestore;
    };
    node.addEventListener('wheel', markUser, { passive: true });
    node.addEventListener('touchmove', markUser, { passive: true });
    node.addEventListener('keydown', markUser);

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      node.removeEventListener('wheel', markUser);
      node.removeEventListener('touchmove', markUser);
      node.removeEventListener('keydown', markUser);
    };
  }, [enabled, memoryRef, revision, scrollRootRef]);
}
