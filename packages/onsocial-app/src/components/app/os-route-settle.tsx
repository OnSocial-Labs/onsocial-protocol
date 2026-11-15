'use client';

import {
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type AnimationEvent,
  type ReactNode,
} from 'react';
import { OsPageBodyAppear } from '@/components/app/os-page-body-appear';

function subscribeClientNavigation() {
  return () => {};
}

function clientNavigationSnapshot() {
  return true;
}

function serverNavigationSnapshot() {
  return false;
}

/**
 * True only for a mount that never had server HTML.
 * Hydration reads the server snapshot and latches it, so the client
 * snapshot that follows cannot cover content the server already painted.
 * Same server/client store split as the compact nav search.
 */
function useMountedOnClientNavigation() {
  const clientNavigation = useSyncExternalStore(
    subscribeClientNavigation,
    clientNavigationSnapshot,
    serverNavigationSnapshot
  );
  const [mountedOnClientNavigation] = useState(clientNavigation);
  return mountedOnClientNavigation;
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
 * Server HTML and the hydration render start done: no cover over content
 * already painted. A client navigation fades the skeleton, then unmounts it.
 * Pass `ready` so thread replies stay on OsPageBodyAppear until permalinkReady.
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
  const clientNav = useMountedOnClientNavigation();
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
