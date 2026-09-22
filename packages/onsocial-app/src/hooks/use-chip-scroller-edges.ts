'use client';

import { useCallback, useEffect, useState, type Ref } from 'react';

export type ChipScrollerEdges = {
  start: boolean;
  end: boolean;
};

export function assignDomRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  if (ref) ref.current = value;
}

/** Horizontal chip rails hide the scrollbar, so overflow needs an edge fade. */
export function chipScrollerEdges(el: {
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
}): ChipScrollerEdges {
  const overflow = el.scrollWidth - el.clientWidth > 1;
  if (!overflow) return { start: false, end: false };
  return {
    start: el.scrollLeft > 1,
    end: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
  };
}

/**
 * Tracks whether a chip scroller has hidden chips on the start or end edge.
 * `active` stays false for wrapping browse chips.
 */
export function useChipScrollerEdges(active: boolean) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState<ChipScrollerEdges>({
    start: false,
    end: false,
  });

  const setScrollerNode = useCallback((next: HTMLDivElement | null) => {
    setNode((prev) => (prev === next ? prev : next));
  }, []);

  useEffect(() => {
    if (!active || !node) return;

    const sync = () => {
      const next = chipScrollerEdges(node);
      setEdges((prev) =>
        prev.start === next.start && prev.end === next.end ? prev : next
      );
    };

    sync();
    node.addEventListener('scroll', sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
    const mutations = new MutationObserver(() => {
      sync();
      for (const child of node.children) observer.observe(child);
    });
    mutations.observe(node, { childList: true });

    return () => {
      node.removeEventListener('scroll', sync);
      observer.disconnect();
      mutations.disconnect();
    };
  }, [active, node]);

  return { setScrollerNode, edges };
}
