'use client';

import { useLayoutEffect, type RefObject } from 'react';

/** Outer edge of the page-chevron focus ring (`0 0 0 4px`). */
const CHEVRON_FOCUS_RING_PX = 4;

/**
 * The face is top-aligned, so bottom padding cannot lift a stack that is
 * already taller than the screen. When that stack would cross the chevron,
 * pull the identity up by the overlap and leave every other page alone.
 */
export function useChevronFaceClearance(
  dockRef: RefObject<HTMLElement | null>,
  enabled: boolean
): void {
  useLayoutEffect(() => {
    if (!enabled) return;
    const dock = dockRef.current;
    if (!dock) return;
    const face = dock.closest('.portfolio-os-layer')?.previousElementSibling;
    const hero =
      face instanceof HTMLElement
        ? face.querySelector<HTMLElement>('.portfolio-hero')
        : null;
    const identity = hero?.querySelector<HTMLElement>('.portfolio-identity');
    if (!hero || !identity) return;

    let frame = 0;
    const watching = new Set<Element>();
    let observer: ResizeObserver;
    const watch = (node: Element | null) => {
      if (!node || watching.has(node)) return;
      watching.add(node);
      observer.observe(node);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    observer = new ResizeObserver(schedule);
    const apply = () => {
      const chevron = dock.querySelector('.portfolio-page-chevron');
      watch(chevron);
      watch(hero.querySelector('.portfolio-signals'));
      if (!(chevron instanceof HTMLElement)) {
        identity.style.marginTop = '';
        identity.style.transition = '';
        return;
      }
      const previous = identity.style.marginTop;
      identity.style.transition = 'none';
      identity.style.marginTop = '';
      const base = Number.parseFloat(getComputedStyle(identity).marginTop) || 0;
      const limit =
        chevron.getBoundingClientRect().top - CHEVRON_FOCUS_RING_PX;
      let lowest = 0;
      for (const node of hero.querySelectorAll('h1, h2, p, a, button, li')) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.closest('.glass-sheet-root')) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        if (rect.bottom > lowest) lowest = rect.bottom;
      }
      const overflow = lowest - limit;
      const next =
        overflow > 0.5 ? `${Math.round((base - overflow) * 2) / 2}px` : '';
      if (previous === next) {
        identity.style.marginTop = previous;
        identity.style.transition = '';
        return;
      }
      identity.style.marginTop = next;
      requestAnimationFrame(() => {
        if (identity.style.marginTop === next) identity.style.transition = '';
      });
    };
    schedule();
    watch(document.documentElement);
    const mutations = new MutationObserver(schedule);
    mutations.observe(hero, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    window.addEventListener('resize', schedule);
    document.fonts?.addEventListener('loadingdone', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', schedule);
      document.fonts?.removeEventListener('loadingdone', schedule);
      identity.style.marginTop = '';
      identity.style.transition = '';
    };
  }, [dockRef, enabled]);
}
