import { useEffect, type RefObject } from 'react';

let lockCount = 0;
let previousBodyOverflow = '';
let previousHtmlOverflow = '';

export function useBodyScrollLock(
  locked: boolean,
  _containerRef?: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!locked) return;

    lockCount += 1;

    if (lockCount === 1) {
      previousBodyOverflow = document.body.style.overflow;
      previousHtmlOverflow = document.documentElement.style.overflow;

      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      window.dispatchEvent(
        new CustomEvent('onsocial:scroll-lock', { detail: { locked: true } })
      );
    }

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount > 0) return;

      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.dispatchEvent(
        new CustomEvent('onsocial:scroll-lock', { detail: { locked: false } })
      );
    };
  }, [locked]);
}
