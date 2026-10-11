'use client';

import { useEffect, type RefObject } from 'react';
import { immersiveTitleHandoff } from '@/lib/immersive-title-handoff';

/**
 * Browsers that can run the scroll-timeline crossfade in CSS. A scroll
 * listener there is a frame late and is what holds the name, then lets it go.
 */
function browserOwnsHandoff(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    CSS.supports('animation-timeline: view()') &&
    CSS.supports('timeline-scope: --os-immersive-title')
  );
}

/**
 * Fallback for browsers without scroll-driven animations. Writes
 * --title-handoff only. No elevated class: that class was a second snap
 * after the fade.
 */
export function useImmersiveTitleHandoff(
  scrollRootRef: RefObject<HTMLElement | null>,
  heroTitleRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  resetKey?: string | null
) {
  useEffect(() => {
    const scrollRoot = scrollRootRef.current;
    if (!enabled || !scrollRoot || browserOwnsHandoff()) return;

    const header = scrollRoot.parentElement?.querySelector<HTMLElement>(
      '.os-app-screen-header'
    );
    const screen = scrollRoot.closest<HTMLElement>('.os-app-screen');

    const sync = () => {
      const hero = heroTitleRef.current;
      const headerBottom =
        header?.getBoundingClientRect().bottom ??
        scrollRoot.getBoundingClientRect().top + 72;
      const heroRect = hero?.getBoundingClientRect();
      const t =
        heroRect && heroRect.height > 0
          ? immersiveTitleHandoff(heroRect.top, headerBottom, heroRect.height)
          : scrollRoot.scrollTop > 18
            ? 1
            : 0;
      screen?.style.setProperty('--title-handoff', t.toFixed(3));
    };

    sync();
    scrollRoot.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync, { passive: true });
    return () => {
      scrollRoot.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      screen?.style.removeProperty('--title-handoff');
    };
  }, [enabled, heroTitleRef, resetKey, scrollRootRef]);
}
