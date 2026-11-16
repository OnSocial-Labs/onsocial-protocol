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
 * A hard load stays on that URL and has not left it, so the swap that
 * replaces `loading.tsx` never paints a skeleton over server content.
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
 * Soft handoff off a route skeleton after a client navigation.
 * The document's first route starts done: no cover in the HTML and none
 * after the loading shell swaps for server-painted content. A later visit
 * to that same path covers once, then this instance stays inert. Pass
 * `ready` so thread replies stay on OsPageBodyAppear until permalinkReady.
 * `settle={false}` still renders this wrapper so the child is not remounted.
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
  const [clientNav] = useState(() => {
    if (!settle || typeof window === 'undefined') return false;
    return routeSettleCovers(
      readDocumentEntryPathname(),
      pathname,
      readDocumentHasLeftEntry()
    );
  });
  const managed = ready !== undefined;
  const [autoReady, setAutoReady] = useState(false);
  const [cover, setCover] = useState<'hold' | 'leave' | 'off'>(
    clientNav ? 'hold' : 'off'
  );

  useLayoutEffect(() => {
    if (!clientNav || managed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fade after layout, same gate as OsPageBodyAppear
    setAutoReady(true);
  }, [clientNav, managed]);

  const settled = !clientNav || (managed ? Boolean(ready) : autoReady);

  useLayoutEffect(() => {
    if (!clientNav || !settled || cover === 'off') return;
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
  }, [clientNav, cover, settled]);

  const showCover = clientNav && cover !== 'off';

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
