'use client';

import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { OsRouteSettle } from '@/components/app/os-route-settle';

/**
 * What the cold-load effect should do with the loading flag.
 * A settle already in flight owns the single clear. SSR clears now.
 * An SSR miss holds loading and starts that one settle.
 */
export function coldLoadReveal(input: {
  serverPainted: boolean;
  settleStarted: boolean;
}): { loading: 'clear' | 'hold' | 'leave'; startSettle: boolean } {
  if (input.settleStarted) return { loading: 'leave', startSettle: false };
  if (input.serverPainted) return { loading: 'clear', startSettle: false };
  return { loading: 'hold', startSettle: true };
}

/**
 * Slow refresh keeps the painted rows. Loading stays clear, and the
 * refreshing flag is the one that drops when the next paint settles.
 */
export function slowRefreshReveal(): { loading: false; refreshing: true } {
  return { loading: false, refreshing: true };
}

/**
 * One slot. A list that is already in the first paint replaces the route
 * skeleton directly — it does not fade in after that skeleton has gone.
 * A list that arrives later crossfades with this skeleton at 280ms.
 */
export function HomeFeedReveal({
  showSkeleton,
  skeleton,
  children,
}: PropsWithChildren<{
  showSkeleton: boolean;
  skeleton: ReactNode;
}>) {
  const [handoff] = useState(showSkeleton);
  if (!handoff) {
    return <div className="home-feed-reveal">{children}</div>;
  }
  return (
    <OsRouteSettle ready={!showSkeleton} skeleton={skeleton}>
      {showSkeleton ? null : children}
    </OsRouteSettle>
  );
}
