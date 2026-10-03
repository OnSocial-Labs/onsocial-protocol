'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSeasonParticipation } from '@/contexts/season-participation-context';
import {
  fetchRallyClaim,
  resolveRallyClaimHint,
  type RallyClaimRecord,
  type RallyRegistryEntry,
} from '@/lib/rally-season';

export type RallyPastClaimHints = {
  /** seasonId → claim (`undefined` while that row is still loading). */
  claims: Record<string, RallyClaimRecord | null | undefined>;
  ready: boolean;
  /** True when a past rally still owes the viewer SOCIAL. */
  hasCollect: boolean;
};

/**
 * Viewer claim per past season — powers row badges and the owed-SOCIAL dot.
 * Confirmed-ledger overrides apply so a fresh collect flips its row at once.
 */
export function useRallyPastClaimHints(
  entries: RallyRegistryEntry[],
  accountId: string | null,
  enabled: boolean
): RallyPastClaimHints {
  const { participateSyncVersion, deriveSeasonClaim } =
    useSeasonParticipation();
  const seasonKey = entries.map((entry) => entry.seasonId).join('\n');
  const requestKey = `${seasonKey}\0${accountId ?? ''}`;
  const [fetched, setFetched] = useState<{
    key: string;
    claims: Record<string, RallyClaimRecord | null>;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !accountId || entries.length === 0) return;
    const key = requestKey;
    let cancelled = false;
    void (async () => {
      const pairs = await Promise.all(
        entries.map(async (entry) => {
          const claim = await fetchRallyClaim(entry.seasonId, accountId).catch(
            () => null
          );
          return [entry.seasonId, claim] as const;
        })
      );
      if (cancelled) return;
      setFetched({ key, claims: Object.fromEntries(pairs) });
    })();
    return () => {
      cancelled = true;
    };
    // participateSyncVersion refetches after a confirmed collect.
  }, [enabled, accountId, requestKey, entries, participateSyncVersion]);

  const claims = useMemo(() => {
    // participateSyncVersion re-derives ledger overrides without a refetch.
    void participateSyncVersion;
    const out: Record<string, RallyClaimRecord | null | undefined> = {};
    const loaded = fetched?.key === requestKey ? fetched.claims : null;
    for (const entry of entries) {
      const raw = loaded ? loaded[entry.seasonId] : undefined;
      out[entry.seasonId] =
        raw === undefined ? undefined : deriveSeasonClaim(raw);
    }
    return out;
  }, [entries, fetched, requestKey, deriveSeasonClaim, participateSyncVersion]);

  const ready =
    !enabled ||
    !accountId ||
    entries.length === 0 ||
    fetched?.key === requestKey;
  const hasCollect = entries.some(
    (entry) =>
      entry.claim_open &&
      resolveRallyClaimHint(claims[entry.seasonId]) === 'collect'
  );

  return { claims, ready, hasCollect };
}
