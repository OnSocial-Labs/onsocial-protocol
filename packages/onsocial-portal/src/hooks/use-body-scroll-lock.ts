'use client';

import { useEffect, type RefObject } from 'react';

let lockCount = 0;
let savedScrollY = 0;
let savedBodyStyle: {
  overflow: string;
  position: string;
  top: string;
  width: string;
  paddingRight: string;
} | null = null;

function getScrollbarWidth(): number {
  if (typeof document === 'undefined') return 0;
  return window.innerWidth - document.documentElement.clientWidth;
}

function lockBody(): void {
  if (typeof document === 'undefined') return;

  savedScrollY = window.scrollY;
  const scrollbarWidth = getScrollbarWidth();
  savedBodyStyle = {
    overflow: document.body.style.overflow,
    position: document.body.style.position,
    top: document.body.style.top,
    width: document.body.style.width,
    paddingRight: document.body.style.paddingRight,
  };

  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedScrollY}px`;
  document.body.style.width = '100%';

  if (scrollbarWidth > 0) {
    document.body.style.paddingRight = `${scrollbarWidth}px`;
  }
}

function unlockBody(): void {
  if (typeof document === 'undefined' || !savedBodyStyle) return;

  document.body.style.overflow = savedBodyStyle.overflow;
  document.body.style.position = savedBodyStyle.position;
  document.body.style.top = savedBodyStyle.top;
  document.body.style.width = savedBodyStyle.width;
  document.body.style.paddingRight = savedBodyStyle.paddingRight;
  window.scrollTo(0, savedScrollY);
  savedBodyStyle = null;
}

/** Lock document scroll while a modal or overlay is open. */
export function useBodyScrollLock(
  locked: boolean,
  _containerRef?: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    void _containerRef;
    if (!locked) return;

    lockCount += 1;
    if (lockCount === 1) {
      lockBody();
    }

    return () => {
      lockCount -= 1;
      if (lockCount <= 0) {
        lockCount = 0;
        unlockBody();
      }
    };
  }, [locked, _containerRef]);
}
