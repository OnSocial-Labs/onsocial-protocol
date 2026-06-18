'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSeasonParticipation } from '@/contexts/season-participation-context';
import type { SeasonZeroClaimRecord } from '@/features/season/season-zero-types';
import { seasonApiPath } from '@/lib/active-season';
import {
  fetchSeasonRegistry,
  type SeasonRegistryEntry,
} from '@/lib/season-registry';

async function fetchClaimableSeasonReward(
  accountId: string,
  seasons: SeasonRegistryEntry[]
): Promise<SeasonZeroClaimRecord | null> {
  const claimOpenSeasons = seasons.filter((entry) => entry.claim_open);
  if (claimOpenSeasons.length === 0) return null;

  for (const season of claimOpenSeasons) {
    const response = await fetch(
      seasonApiPath(season.seasonId, `claims/${encodeURIComponent(accountId)}`),
      { cache: 'no-store' }
    );
    if (!response.ok) continue;

    const data = (await response.json()) as {
      claim?: SeasonZeroClaimRecord | null;
    };
    const claim = data.claim ?? null;
    if (!claim || claim.claimed) continue;
    if (BigInt(claim.amountYocto || '0') <= 0n) continue;
    return claim;
  }

  return null;
}

export function useProfileSeasonClaim(
  accountId: string | null,
  enabled: boolean
) {
  const {
    deriveSeasonClaim,
    reconcileSeasonClaimFromApi,
    participateSyncVersion,
  } = useSeasonParticipation();
  const [claim, setClaim] = useState<SeasonZeroClaimRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchedForAccountId, setFetchedForAccountId] = useState<
    string | null | undefined
  >(undefined);

  useEffect(() => {
    setClaim(null);
    setFetchedForAccountId(undefined);
  }, [accountId]);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setClaim(null);
      setLoading(false);
      return;
    }

    if (!accountId) {
      setClaim(null);
      setFetchedForAccountId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const registry = await fetchSeasonRegistry();
      if (!registry) {
        setClaim(null);
        return;
      }

      const next = await fetchClaimableSeasonReward(
        accountId,
        registry.seasons
      );
      if (next) {
        reconcileSeasonClaimFromApi(next.seasonId, Boolean(next.claimed));
      }
      setClaim(next);
    } catch {
      setClaim(null);
    } finally {
      setFetchedForAccountId(accountId);
      setLoading(false);
    }
  }, [accountId, enabled, reconcileSeasonClaimFromApi]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !accountId) return;

    const timers = [2_000, 5_000].map((delay) =>
      window.setTimeout(() => {
        void refresh();
      }, delay)
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [accountId, enabled, participateSyncVersion, refresh]);

  const claimReadyForAccount = fetchedForAccountId === (accountId ?? null);
  const derivedClaim = useMemo(
    () => (claimReadyForAccount ? deriveSeasonClaim(claim) : null),
    [claim, claimReadyForAccount, deriveSeasonClaim, participateSyncVersion]
  );

  return {
    claim: derivedClaim?.claimed ? null : derivedClaim,
    loading: loading || !claimReadyForAccount,
    refresh,
  };
}
