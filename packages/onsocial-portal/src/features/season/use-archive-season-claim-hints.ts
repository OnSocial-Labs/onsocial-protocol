'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet } from '@/contexts/wallet-context';
import { useSeasonParticipation } from '@/contexts/season-participation-context';
import {
  fetchArchiveSeasonClaimHint,
  type ArchiveSeasonClaimHint,
} from '@/features/season/season-archive-claim-hints';
import type { SeasonRegistryEntry } from '@/lib/season-registry';

export function useArchiveSeasonClaimHints(
  entries: SeasonRegistryEntry[],
  enabled = true
) {
  const { accountId, isLoading: walletLoading } = useWallet();
  const {
    resolveArchiveClaimHint,
    reconcileSeasonClaimFromApi,
    participateSyncVersion,
  } = useSeasonParticipation();
  const [hints, setHints] = useState<Record<string, ArchiveSeasonClaimHint>>(
    {}
  );
  const [fetchedForAccountId, setFetchedForAccountId] = useState<
    string | null | undefined
  >(undefined);
  const [loading, setLoading] = useState(false);

  const claimOpenSeasonIds = useMemo(
    () =>
      entries
        .filter((entry) => entry.claim_open)
        .map((entry) => entry.seasonId)
        .sort()
        .join(','),
    [entries]
  );

  useEffect(() => {
    setHints({});
    setFetchedForAccountId(undefined);
  }, [accountId]);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setHints({});
      setLoading(false);
      return;
    }

    if (walletLoading) {
      return;
    }

    if (!accountId) {
      setHints({});
      setFetchedForAccountId(null);
      setLoading(false);
      return;
    }

    const seasonIds = claimOpenSeasonIds ? claimOpenSeasonIds.split(',') : [];

    if (seasonIds.length === 0) {
      setHints({});
      setFetchedForAccountId(accountId);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const pairs = await Promise.all(
        seasonIds.map(async (seasonId) => {
          const apiHint = await fetchArchiveSeasonClaimHint(
            accountId,
            seasonId
          );
          if (apiHint === 'collected') {
            reconcileSeasonClaimFromApi(seasonId, true);
          }
          return [
            seasonId,
            resolveArchiveClaimHint(seasonId, apiHint),
          ] as const;
        })
      );
      setHints(Object.fromEntries(pairs));
    } catch {
      setHints({});
    } finally {
      setFetchedForAccountId(accountId);
      setLoading(false);
    }
  }, [
    accountId,
    claimOpenSeasonIds,
    enabled,
    reconcileSeasonClaimFromApi,
    resolveArchiveClaimHint,
    walletLoading,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !accountId || walletLoading) return;

    const timers = [2_000, 5_000].map((delay) =>
      window.setTimeout(() => {
        void refresh();
      }, delay)
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [accountId, enabled, participateSyncVersion, refresh, walletLoading]);

  const hintsReady =
    !walletLoading && !loading && fetchedForAccountId === (accountId ?? null);

  const resolvedHints = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(hints).map(([seasonId, hint]) => [
          seasonId,
          resolveArchiveClaimHint(seasonId, hint),
        ])
      ),
    [hints, participateSyncVersion, resolveArchiveClaimHint]
  );

  const hasCollectHint =
    hintsReady &&
    Object.values(resolvedHints).some((hint) => hint === 'collect');

  return {
    hints: resolvedHints,
    hintsReady,
    hasCollectHint,
    walletConnected: Boolean(accountId),
    refresh,
  };
}
