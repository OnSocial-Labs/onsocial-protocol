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
let findScrollContainer: ScrollLockContainerFinder = () =>
  document.querySelector<HTMLElement>('.os-app-screen-body') ??
  document.querySelector<HTMLElement>('.portfolio-frame') ??
  document.querySelector<HTMLElement>('.frame');

/** Replace the element lookup used by {@link useScrollLock}. */
export function configureScrollLockContainerFinder(
  finder: ScrollLockContainerFinder
): void {
  findScrollContainer = finder;
}

function blockScroll(event: Event) {
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
