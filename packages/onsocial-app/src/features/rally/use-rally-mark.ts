'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSeasonParticipation } from '@/contexts/season-participation-context';
import {
  fetchRallyClaim,
  fetchRallyMe,
  formatRallyMarkCaption,
  type RallyClaimRecord,
  type RallyRegistryEntry,
  type RallyStanding,
} from '@/lib/rally-season';

export type RallyMarkState = {
  loaded: boolean;
  visible: boolean;
  nudge: boolean;
  label: string;
  ariaLabel: string;
};

export function useRallyMark(
  entry: RallyRegistryEntry | null,
  pageTitle: string,
  accountId: string | null
): RallyMarkState {
  const {
    participateSyncVersion,
    deriveSeasonClaim,
    reconcileSeasonClaimFromApi,
    reconcileSeasonJoinFromApi,
    resolveSeasonJoinedFor,
  } = useSeasonParticipation();
  const [loaded, setLoaded] = useState(!entry);
  const [standing, setStanding] = useState<RallyStanding | null>(null);
  const [apiClaim, setApiClaim] = useState<RallyClaimRecord | null>(null);

  const seasonId = entry?.seasonId ?? null;

  useEffect(() => {
    if (!seasonId) {
      setStanding(null);
      setApiClaim(null);
      setLoaded(true);
      return;
    }
    if (!accountId) {
      setStanding(null);
      setApiClaim(null);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    void (async () => {
      const [nextStanding, nextClaim] = await Promise.all([
        fetchRallyMe(seasonId, accountId),
        fetchRallyClaim(seasonId, accountId),
      ]);
      if (cancelled) return;
      setStanding(nextStanding);
      setApiClaim(nextClaim);
      reconcileSeasonJoinFromApi(seasonId, Boolean(nextStanding));
      if (nextClaim) {
        reconcileSeasonClaimFromApi(seasonId, Boolean(nextClaim.claimed));
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    accountId,
    reconcileSeasonClaimFromApi,
    reconcileSeasonJoinFromApi,
    seasonId,
  ]);

  const joined = seasonId
    ? resolveSeasonJoinedFor(seasonId, Boolean(standing))
    : false;
  const claim = deriveSeasonClaim(apiClaim);
  const canJoin = Boolean(entry?.is_live) && !joined;
  const canCollect = Boolean(
    entry?.claim_open && claim && claim.claimed === false
  );
  const label = formatRallyMarkCaption({
    collectYocto: canCollect ? claim?.amountYocto : null,
    rank: joined ? standing?.rank : null,
  });

  return useMemo(() => {
    if (!entry) {
      return {
        loaded,
        visible: false,
        nudge: false,
        label: '',
        ariaLabel: pageTitle,
      };
    }

    const ariaLabel = canCollect
      ? `${label || 'SOCIAL'} ready to collect from ${pageTitle}`
      : joined && label
        ? `${label} in ${pageTitle}`
        : canJoin
          ? `Join ${pageTitle}`
          : pageTitle;

    return {
      loaded,
      visible: true,
      nudge: canJoin || canCollect,
      label,
      ariaLabel,
    };
  }, [
    canCollect,
    canJoin,
    entry,
    joined,
    label,
    loaded,
    pageTitle,
    participateSyncVersion,
  ]);
}
