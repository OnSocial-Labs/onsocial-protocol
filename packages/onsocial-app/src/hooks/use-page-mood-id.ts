'use client';

import { useSyncExternalStore } from 'react';
import { accountIdsEqual } from '@/lib/account-match';
import type { MoodId } from '@/lib/moods/types';

const PORTFOLIO_MOOD_SELECTOR =
  '.portfolio-frame[data-mood], .portfolio-os-layer[data-mood]';

function getPortfolioMoodSnapshot(): MoodId | null {
  if (typeof document === 'undefined') {
    return null;
  }

  return (
    (document
      .querySelector(PORTFOLIO_MOOD_SELECTOR)
      ?.getAttribute('data-mood') as MoodId | null) ?? null
  );
}

function subscribePortfolioMood(onStoreChange: () => void) {
  if (typeof document === 'undefined') {
    return () => {};
  }

  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['data-mood'],
    childList: true,
  });

  return () => observer.disconnect();
}

/** Read the active portfolio mood from the page shell when editing as the page owner. */
export function usePageMoodId(
  pageAccountId: string | undefined,
  walletAccountId: string,
  enabled: boolean
): MoodId | null {
  const shouldRead =
    enabled &&
    Boolean(pageAccountId) &&
    Boolean(walletAccountId) &&
    accountIdsEqual(pageAccountId!, walletAccountId);

  const moodId = useSyncExternalStore(
    subscribePortfolioMood,
    getPortfolioMoodSnapshot,
    () => null
  );

  return shouldRead ? moodId : null;
}
