'use client';

import {
  useLayoutEffect,
  useState,
  type AnimationEvent,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { OsPageBodyAppear } from '@/components/app/os-page-body-appear';
import {
  readDocumentEntryPathname,
  readDocumentHasLeftEntry,
} from '@/lib/intent-prefetch';

/**
 * Cover a client navigation, including a return to the document's first URL.
 * Unmanaged hard loads stay off so `loading.tsx` can swap for painted content
 * without a second skeleton. Managed `ready` is separate — see
 * `routeSettleHoldsCover`.
 */
export function routeSettleCovers(
  entryPathname: string | null,
  pathname: string | null,
  hasLeftEntry: boolean
): boolean {
  if (!entryPathname || !pathname) return false;
  if (entryPathname !== pathname) return true;
  return hasLeftEntry;
}

/**
 * Hold the skeleton while a managed gate is closed — hard load included.
 * Post threads pass `permalinkReady`; without this cover the body sits at
 * opacity 0 and the Post shell reads as blank (frame-only anti-pattern).
 */
export function routeSettleHoldsCover(
  settle: boolean,
  ready: boolean | undefined
): boolean {
  if (!settle || ready === undefined) return false;
  return !ready;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** `--os-motion-appear` (280ms fallback). Unmount follows the fade. */
function routeSettleFadeMs() {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--os-motion-appear')
    .trim();
  if (raw.endsWith('ms')) {
    const ms = Number.parseFloat(raw);
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  if (raw.endsWith('s')) {
    const seconds = Number.parseFloat(raw);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  return 280;
}

/**
 * Soft handoff off a route skeleton.
 * Unmanaged: cover client navigations only — the document's first route
 * starts done so `loading.tsx` can swap for server content without a
 * second skeleton. Managed `ready` (post permalink): hold the skeleton
 * until ready on hard load and client nav so the opacity-0 body never
 * paints as an empty Post shell. `settle={false}` still wraps children.
 */
export function OsRouteSettle({
  settle = true,
  ready,
  skeleton,
  children,
}: PropsWithChildren<{
  /** False paints children immediately and still keeps this wrapper. */
  settle?: boolean;
  ready?: boolean;
  skeleton: ReactNode;
}>) {
  const pathname = usePathname();
  const managed = ready !== undefined;
  const [clientNav] = useState(() => {
    if (!settle || typeof window === 'undefined') return false;
    return routeSettleCovers(
      readDocumentEntryPathname(),
      pathname,
      readDocumentHasLeftEntry()
    );
  });
  const [autoReady, setAutoReady] = useState(false);
  const [cover, setCover] = useState<'hold' | 'leave' | 'off'>(() => {
    if (routeSettleHoldsCover(settle, ready)) return 'hold';
    // Already painted — appear the body. A client hop must not put a
    // skeleton back over a post the feed is holding.
    if (ready === true) return 'off';
    if (typeof window === 'undefined') return 'off';
    return clientNav ? 'hold' : 'off';
  });

  useLayoutEffect(() => {
    if (!clientNav || managed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fade after layout, same gate as OsPageBodyAppear
    setAutoReady(true);
  }, [clientNav, managed]);

  const settled = managed
    ? Boolean(ready)
    : !clientNav || autoReady;

  useLayoutEffect(() => {
    if (!settled || cover === 'off') return;
    if (prefersReducedMotion()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reduced motion drops the cover; it must not sit on painted text
      setCover('off');
      return;
    }
    if (cover === 'hold') {
      setCover('leave');
    }
    const timer = window.setTimeout(() => setCover('off'), routeSettleFadeMs());
    return () => window.clearTimeout(timer);
  }, [cover, settled]);

  const showCover = cover !== 'off';

  return (
    <div
      className="os-route-settle"
      aria-busy={showCover && cover === 'hold' ? true : undefined}
    >
      {managed ? (
        <OsPageBodyAppear ready={Boolean(ready)}>{children}</OsPageBodyAppear>
      ) : (
        children
      )}
      {showCover ? (
        <div
          className={
            cover === 'leave'
              ? 'os-route-skeleton is-done'
              : 'os-route-skeleton'
          }
          aria-hidden
          onAnimationEnd={(event: AnimationEvent<HTMLDivElement>) => {
            if (event.target !== event.currentTarget) return;
            setCover('off');
          }}
        >
          {skeleton}
        </div>
      ) : null}
    </div>
  );
}
