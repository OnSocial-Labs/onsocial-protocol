'use client';

import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { OsRouteSettle } from '@/components/app/os-route-settle';

/**
 * What the cold-load effect should do with the loading flag.
 * A settle already in flight is left alone. SSR clears now.
 * An SSR miss starts one settle. The adopted page clears loading
 * (`nextColdLoadLoading`) so side paint does not block the list.
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
 * Loading flag once the cold page is the list. SSR, a saved session, and
 * the speculative page are usable immediately. A settle already in flight
 * keeps whatever the flag is now.
 */
export function nextColdLoadLoading(
  loading: boolean,
  decision: ReturnType<typeof coldLoadReveal>
): boolean {
  if (decision.loading === 'clear' || decision.startSettle) return false;
  return loading;
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
