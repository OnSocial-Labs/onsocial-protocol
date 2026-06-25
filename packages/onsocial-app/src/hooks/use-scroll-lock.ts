'use client';

import { useLayoutEffect } from 'react';

let lockCount = 0;
let scrollContainer: HTMLElement | null = null;
let lockedScrollTop = 0;

function findScrollContainer(): HTMLElement | null {
  return document.querySelector('.portfolio-frame') ?? document.querySelector('.frame');
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
  scrollContainer.addEventListener('touchmove', blockScroll, { passive: false });
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
