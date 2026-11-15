'use client';

import {
  useLayoutEffect,
  useState,
  type AnimationEvent,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { OsPageBodyAppear } from '@/components/app/os-page-body-appear';
import { documentEntryPathname } from '@/lib/intent-prefetch';

/**
 * Cover only after a client navigation away from the document's first URL.
 * A hard load — including the client swap that replaces `loading.tsx` once
 * the server payload arrives — stays on that first URL, so it never paints
 * a skeleton over content the server already produced.
 */
export function routeSettleCovers(
  entryPathname: string | null,
  pathname: string | null
): boolean {
  return Boolean(entryPathname && pathname && entryPathname !== pathname);
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
 * after the loading shell swaps for server-painted content. Pass `ready`
 * so thread replies stay on OsPageBodyAppear until permalinkReady.
 */
export function OsRouteSettle({
  ready,
  skeleton,
  children,
}: {
  ready?: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [clientNav] = useState(() =>
    routeSettleCovers(documentEntryPathname, pathname)
  );
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
