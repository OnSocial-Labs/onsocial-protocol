'use client';

import { useCallback, type FocusEventHandler } from 'react';

const MOBILE_MAX_WIDTH_PX = 767;
const KEYBOARD_SCROLL_RETRY_MS = 280;

export function scrollMobileFieldIntoView(element: HTMLElement | null) {
  if (!element || typeof window === 'undefined') {
    return;
  }

  if (!window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches) {
    return;
  }

  const run = () => {
    const viewport = window.visualViewport;
    if (!viewport) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    const rect = element.getBoundingClientRect();
    const topInset = viewport.offsetTop + 72;
    const bottomInset = viewport.offsetTop + viewport.height - 96;

    if (rect.top < topInset || rect.bottom > bottomInset) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  requestAnimationFrame(run);
  window.setTimeout(run, KEYBOARD_SCROLL_RETRY_MS);
}

export function useMobileFieldFocusScroll<
  T extends HTMLElement = HTMLElement,
>(): FocusEventHandler<T> {
  return useCallback((event) => {
    scrollMobileFieldIntoView(event.currentTarget);
  }, []);
}
