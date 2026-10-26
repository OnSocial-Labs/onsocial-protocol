'use client';

import { useEffect, useState } from 'react';
import { ChevronDownIcon } from '@onsocial/ui';
import {
  HOME_FEED_PULL_IDLE,
  homeFeedPullArmed,
  homeFeedPullLabel,
  type HomeFeedPullState,
} from '@/features/home/home-feed-pull-refresh';
import type { HomeFeedPullListener } from '@/features/home/use-home-feed-pull-refresh';

/**
 * Overlay for a top-of-feed drag. It translates itself. The scroller's
 * padding stays put so the rows do not jump under the finger.
 */
export function HomeFeedPullIndicator({
  subscribe,
}: {
  subscribe: (listener: HomeFeedPullListener) => () => void;
}) {
  const [pull, setPull] = useState<HomeFeedPullState>(HOME_FEED_PULL_IDLE);
  useEffect(() => subscribe(setPull), [subscribe]);
  const { phase, distance } = pull;
  const label = homeFeedPullLabel(phase, distance);
  if (!label) return null;
  const armed = phase === 'refreshing' || homeFeedPullArmed(distance);
  return (
    <div
      className={`home-feed-pull${armed ? ' is-armed' : ''}${phase === 'refreshing' ? ' is-refreshing' : ''}`}
      style={{ ['--home-feed-pull' as string]: `${distance}px` }}
      role="status"
      aria-live="polite"
    >
      <span className="home-feed-pull-pill">
        <ChevronDownIcon className="home-feed-pull-chevron" aria-hidden />
        <span className="home-feed-pull-copy">{label}</span>
      </span>
    </div>
  );
}
