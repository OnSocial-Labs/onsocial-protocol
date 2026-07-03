'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useViewerWalletMoodContext } from '@/contexts/viewer-wallet-mood-context';
import { accountIdsEqual } from '@/lib/account-match';
import { fetchPageConfigFromBrowserProxy } from '@/lib/read-page-config';
import {
  pageContentDrawerPanelStyle,
  portfolioMoodShellStyle,
  resolvePortfolioMood,
} from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import {
  usePortfolioMoodVars,
  type PortfolioMoodVarsSnapshot,
} from '@/hooks/use-portfolio-mood-vars';

const DISABLED_SNAPSHOT: PortfolioMoodVarsSnapshot = {
  moodId: null,
  style: undefined,
};

const committedMoodCache = new Map<string, ResolvedMood>();

export function invalidateViewerCommittedMoodCache(accountId?: string) {
  if (accountId) {
    committedMoodCache.delete(accountId);
    return;
  }

  committedMoodCache.clear();
}

function resolvedMoodToPanelStyle(mood: ResolvedMood): CSSProperties {
  return {
    ...portfolioMoodShellStyle(mood.cssVars),
    ...pageContentDrawerPanelStyle(mood.cssVars),
  } as CSSProperties;
}

function snapshotFromMood(mood: ResolvedMood): PortfolioMoodVarsSnapshot {
  return {
    moodId: mood.id,
    style: resolvedMoodToPanelStyle(mood),
  };
}

function useViewerCommittedMood(
  walletAccountId: string,
  enabled: boolean
): PortfolioMoodVarsSnapshot {
  const { setMood } = useViewerWalletMoodContext();
  const [fetched, setFetched] = useState<{
    accountId: string;
    snapshot: PortfolioMoodVarsSnapshot;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !walletAccountId) {
      return;
    }

    const cached = committedMoodCache.get(walletAccountId);
    if (cached) {
      setMood(cached);
      return;
    }

    let cancelled = false;

    const commitMood = (mood: ResolvedMood) => {
      committedMoodCache.set(walletAccountId, mood);
      setMood(mood);
      if (!cancelled) {
        setFetched({
          accountId: walletAccountId,
          snapshot: snapshotFromMood(mood),
        });
      }
    };

    void fetchPageConfigFromBrowserProxy(walletAccountId)
      .then((config) => {
        commitMood(resolvePortfolioMood(config));
      })
      .catch(() => {
        commitMood(resolvePortfolioMood({}));
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, setMood, walletAccountId]);

  if (!enabled || !walletAccountId) {
    return DISABLED_SNAPSHOT;
  }

  const cached = committedMoodCache.get(walletAccountId);
  if (cached) {
    return snapshotFromMood(cached);
  }

  if (fetched?.accountId === walletAccountId) {
    return fetched.snapshot;
  }

  return DISABLED_SNAPSHOT;
}

/** Viewer wallet mood — portfolio context, live shell on own page, fetch fallback. */
export function useViewerWalletMoodVars(
  walletAccountId: string,
  pageAccountId: string | undefined,
  enabled: boolean
): PortfolioMoodVarsSnapshot {
  const { mood: contextMood } = useViewerWalletMoodContext();
  const isOnOwnPortfolioPage =
    enabled &&
    Boolean(walletAccountId) &&
    Boolean(pageAccountId) &&
    accountIdsEqual(pageAccountId!, walletAccountId);

  const liveShell = usePortfolioMoodVars(
    pageAccountId,
    walletAccountId,
    isOnOwnPortfolioPage
  );

  const fetched = useViewerCommittedMood(
    walletAccountId,
    enabled && Boolean(walletAccountId) && !contextMood
  );

  const baseSnapshot = contextMood ? snapshotFromMood(contextMood) : fetched;

  if (isOnOwnPortfolioPage && liveShell.moodId) {
    return {
      moodId: liveShell.moodId,
      style: {
        ...baseSnapshot.style,
        ...liveShell.style,
      } as CSSProperties,
    };
  }

  return baseSnapshot;
}
