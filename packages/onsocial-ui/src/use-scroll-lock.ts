'use client';

import { useLayoutEffect } from 'react';

let lockCount = 0;
let scrollContainer: HTMLElement | null = null;
let lockedScrollTop = 0;

export type ScrollLockContainerFinder = () => HTMLElement | null;

/**
 * Default: OnSocial app screen / portfolio / portal frame scrollers.
 * Override with {@link configureScrollLockContainerFinder} when needed.
 */
let findScrollContainer: ScrollLockContainerFinder = () => {
  const bodies = document.querySelectorAll<HTMLElement>('.os-app-screen-body');
  for (let i = 0; i < bodies.length; i += 1) {
    const body = bodies[i];
    // Overlay pages own their scroller — lock the screen behind them, never the slide.
    if (body.closest('.os-slide-over, [data-os-slide-over="true"]')) {
      continue;
    }
    return body;
  }

  return (
    document.querySelector<HTMLElement>('.portfolio-frame') ??
    document.querySelector<HTMLElement>('.frame')
  );
};

/** Replace the element lookup used by {@link useScrollLock}. */
export function configureScrollLockContainerFinder(
  finder: ScrollLockContainerFinder
): void {
  findScrollContainer = finder;
}

function eventIsInsideSlideOver(event: Event): boolean {
  for (const node of event.composedPath()) {
    if (!(node instanceof Element)) continue;
    return Boolean(node.closest('.os-slide-over, [data-os-slide-over="true"]'));
  }
  return false;
}

function blockScroll(event: Event) {
  // Overlay is often a child of the locked card (portfolio host). Don't
  // cancel its own scroller — only the page behind it.
  if (eventIsInsideSlideOver(event)) {
    return;
  }
  event.preventDefault();
}

function lockScrollContainer() {
  lockCount += 1;
  if (lockCount > 1) {
    return;
  }

  scrollContainer = findScrollContainer();
  if (!scrollContainer) {
    return;
  }

  lockedScrollTop = scrollContainer.scrollTop;
  scrollContainer.dataset.scrollLocked = 'true';
  scrollContainer.addEventListener('wheel', blockScroll, { passive: false });
  scrollContainer.addEventListener('touchmove', blockScroll, {
    passive: false,
  });
}

function unlockScrollContainer() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) {
    return;
  }

  if (!scrollContainer) {
    return;
  }

  scrollContainer.removeEventListener('wheel', blockScroll);
  scrollContainer.removeEventListener('touchmove', blockScroll);
  delete scrollContainer.dataset.scrollLocked;
  scrollContainer.scrollTop = lockedScrollTop;
  scrollContainer = null;
}

/** Block background scroll while sheets are open — no overflow toggle, no layout shift. */
export function useScrollLock(locked: boolean) {
  useLayoutEffect(() => {
    if (!locked) {
      return;
    }

    lockScrollContainer();
    return unlockScrollContainer;
  }, [locked]);
}
