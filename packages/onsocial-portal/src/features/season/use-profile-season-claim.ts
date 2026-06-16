'use client';

import { useCallback, useEffect, useState } from 'react';
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
  const [claim, setClaim] = useState<SeasonZeroClaimRecord | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !accountId) {
      setClaim(null);
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
      setClaim(next);
    } catch {
      setClaim(null);
    } finally {
      setLoading(false);
    }
  }, [accountId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { claim, loading, refresh };
}
