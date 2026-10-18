'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useListScrollRestore } from '@/hooks/use-list-scroll-restore';
import { peekPlaceScroll, writePlaceScroll } from '@/lib/catalog-place-memory';
import {
  createListScrollMemory,
  resetListScrollMemory,
  scrollLineOnLeave,
  scrollTopToPersist,
  type ListScrollMemory,
} from '@/lib/list-scroll-restore';
import { getAppLenis } from '@/lib/app-lenis-registry';

/** Put a catalog scroller back on the line this tab left. */
export function usePlaceScroll(
  placeKey: string,
  scrollRootRef: RefObject<HTMLElement | null>,
  revision: unknown
): void {
  const memoryRef = useRef<ListScrollMemory>(
    createListScrollMemory(peekPlaceScroll(placeKey))
  );
  const keyRef = useRef(placeKey);

  useLayoutEffect(() => {
    if (keyRef.current === placeKey) return;
    // The scroller may already show the next catalog. Keep the line we had.
    persistPlace(keyRef.current, null, memoryRef.current);
    keyRef.current = placeKey;
    resetListScrollMemory(memoryRef.current, peekPlaceScroll(placeKey));
  }, [placeKey]);

  useLayoutEffect(() => {
    const node = scrollRootRef.current;
    const memory = memoryRef.current;
    return () => {
      persistPlace(keyRef.current, node, memory);
    };
  }, [scrollRootRef]);

  useListScrollRestore(
    scrollRootRef,
    memoryRef,
    `${placeKey}\n${String(revision)}`
  );
}

function persistPlace(
  key: string,
  node: HTMLElement | null,
  memory: ListScrollMemory
): void {
  const live = node?.scrollTop ?? 0;
  const lenisTop = node ? (getAppLenis(node)?.scroll ?? 0) : 0;
  const line = memory.userAdjusted
    ? memory.landed
    : scrollLineOnLeave(Math.max(live, lenisTop), memory.landed);
  writePlaceScroll(key, scrollTopToPersist(memory, line));
}
