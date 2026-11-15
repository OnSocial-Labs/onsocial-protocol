'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  createIntentPrefetchSession,
  type IntentPrefetchKind,
} from '@/lib/intent-prefetch';

function linkFromTarget(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.target === '_blank' || anchor.hasAttribute('download'))
    return null;
  return anchor;
}

/** True when the pointer moved into the link, not between its children. */
function pointerEnteredLink(event: PointerEvent): HTMLAnchorElement | null {
  const anchor = linkFromTarget(event.target);
  if (!anchor) return null;
  const from = event.relatedTarget;
  if (from instanceof Node && anchor.contains(from)) return null;
  return anchor;
}

function keyboardFocus(event: FocusEvent, anchor: HTMLAnchorElement): boolean {
  if (anchor.matches(':focus-visible')) return true;
  return (
    event.target instanceof Element && event.target.matches(':focus-visible')
  );
}

/**
 * Prefetch on pointer enter, touch, and keyboard focus for every app link.
 * Viewport idle prefetch stays as it is; this does not prefetch on render
 * or while a scroll is moving links under the pointer.
 */
export function IntentPrefetchHost() {
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    const session = createIntentPrefetchSession((href) => {
      routerRef.current.prefetch(href);
    });

    const request = (
      anchor: HTMLAnchorElement,
      kind: IntentPrefetchKind,
      keyboard: boolean
    ) => {
      const href = anchor.getAttribute('href');
      if (!href) return;
      session.request({
        href,
        base: window.location.href,
        current: `${window.location.pathname}${window.location.search}`,
        kind,
        now: performance.now(),
        keyboard,
      });
    };

    const onScroll = () => {
      session.noteScroll(performance.now());
    };
    const onPointerOver = (event: PointerEvent) => {
      const anchor = pointerEnteredLink(event);
      if (!anchor) return;
      request(anchor, 'pointerenter', false);
    };
    const onTouchStart = (event: TouchEvent) => {
      const anchor = linkFromTarget(event.target);
      if (!anchor) return;
      request(anchor, 'touchstart', false);
    };
    const onFocusIn = (event: FocusEvent) => {
      const anchor = linkFromTarget(event.target);
      if (!anchor) return;
      request(anchor, 'focus', keyboardFocus(event, anchor));
    };

    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('touchstart', onTouchStart, true);
    document.addEventListener('focusin', onFocusIn, true);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('focusin', onFocusIn, true);
    };
  }, []);

  return null;
}
