'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSeasonParticipation } from '@/contexts/season-participation-context';
import { fetchWalletSocialBalanceYocto } from '@/features/boost/boost-position';
import {
  fetchJoinRallyMinYocto,
  fetchRallyClaim,
  fetchRallyMe,
  fetchRallyStatus,
  formatJoinRallyMinLabel,
  resolveRallyLifecyclePhase,
  resolveRallyPresentation,
  type RallyClaimRecord,
  type RallyLifecyclePhase,
  type RallyStanding,
} from '@/lib/rally-season';

export type RallyPlayerState = {
  loaded: boolean;
  seasonId: string;
  pageTitle: string;
  profileBadgeLabel: string;
  phase: RallyLifecyclePhase | null;
  joined: boolean;
  standing: RallyStanding | null;
  claim: RallyClaimRecord | null;
  joinMinYocto: bigint | null;
  joinMinLabel: string | null;
  balanceYocto: bigint | null;
  hasEnoughSocial: boolean;
  canJoin: boolean;
  canCollect: boolean;
  joinPending: boolean;
  claimPending: boolean;
  refresh: () => void;
};

export function useRallyPlayer(
  seasonId: string | null,
  accountId: string | null,
  enabled: boolean
): RallyPlayerState {
  const {
    participateSyncVersion,
    deriveSeasonClaim,
    reconcileSeasonClaimFromApi,
    reconcileSeasonJoinFromApi,
    resolveSeasonJoinedFor,
    isSeasonJoinPending,
    isSeasonClaimPending,
    hasSeasonJoinConfirmed,
  } = useSeasonParticipation();
  const [reloadNonce, setReloadNonce] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState<RallyLifecyclePhase | null>(null);
  const [apiStanding, setApiStanding] = useState<RallyStanding | null>(null);
  const [apiClaim, setApiClaim] = useState<RallyClaimRecord | null>(null);
  const [joinMinYocto, setJoinMinYocto] = useState<bigint | null>(null);
  const [balanceYocto, setBalanceYocto] = useState<bigint | null>(null);
  const [label, setLabel] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setReloadNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !seasonId) {
      setLoaded(Boolean(!seasonId));
      return;
    }
    let cancelled = false;
    void (async () => {
      const [status, standing, claim, chainMin, balance] = await Promise.all([
        fetchRallyStatus(seasonId),
        accountId ? fetchRallyMe(seasonId, accountId) : Promise.resolve(null),
        accountId
          ? fetchRallyClaim(seasonId, accountId)
          : Promise.resolve(null),
        fetchJoinRallyMinYocto(),
        accountId
          ? fetchWalletSocialBalanceYocto(accountId).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setLabel(status?.onChainConfig?.label ?? null);
      setPhase(
        resolveRallyLifecyclePhase(
          status?.onChainConfig ?? null,
          status?.settlement ?? null
        )
      );
      setApiStanding(standing);
      setApiClaim(claim);
      const statusMin = status?.joinMinYocto
        ? (() => {
            try {
              return BigInt(status.joinMinYocto);
            } catch {
              return null;
            }
          })()
        : null;
      setJoinMinYocto(chainMin ?? statusMin);
      setBalanceYocto(balance);
      if (accountId) {
        reconcileSeasonJoinFromApi(seasonId, Boolean(standing));
        if (claim) {
          reconcileSeasonClaimFromApi(seasonId, Boolean(claim.claimed));
        }
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    accountId,
    enabled,
    reconcileSeasonClaimFromApi,
    reconcileSeasonJoinFromApi,
    reloadNonce,
    seasonId,
  ]);

  const presentation = resolveRallyPresentation(seasonId ?? 'season-one', label);
  const joined = seasonId
    ? resolveSeasonJoinedFor(seasonId, Boolean(apiStanding))
    : false;
  const claim = deriveSeasonClaim(apiClaim);
  const joinPending = seasonId ? isSeasonJoinPending(seasonId) : false;
  const claimPending = seasonId ? isSeasonClaimPending(seasonId) : false;
  const hasEnoughSocial =
    joinMinYocto != null &&
    balanceYocto != null &&
    balanceYocto >= joinMinYocto;
  const canJoin =
    Boolean(seasonId) &&
    phase === 'live' &&
    !joined &&
    joinMinYocto != null &&
    (accountId == null || hasEnoughSocial);
  const canCollect =
    phase === 'claim_open' && Boolean(claim && claim.claimed === false);
  const hasJoinOverride = seasonId ? hasSeasonJoinConfirmed(seasonId) : false;
  const hasClaimOverride = Boolean(
    seasonId && claim?.claimed && apiClaim && apiClaim.claimed !== true
  );

  useEffect(() => {
    if (!enabled || !seasonId) return;
    if (!hasJoinOverride && !hasClaimOverride) return;
    const timers = [2_000, 5_000].map((ms) => window.setTimeout(refresh, ms));
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [enabled, hasClaimOverride, hasJoinOverride, refresh, seasonId]);

  return useMemo(
    () => ({
      loaded,
      seasonId: seasonId ?? '',
      pageTitle: presentation.pageTitle,
      profileBadgeLabel: presentation.profileBadgeLabel,
      phase,
      joined,
      standing: apiStanding,
      claim,
      joinMinYocto,
      joinMinLabel: joinMinYocto ? formatJoinRallyMinLabel(joinMinYocto) : null,
      balanceYocto,
      hasEnoughSocial,
      canJoin,
      canCollect,
      joinPending,
      claimPending,
      refresh,
    }),
    [
      apiStanding,
      balanceYocto,
      canCollect,
      canJoin,
      claim,
      claimPending,
      hasEnoughSocial,
      joinMinYocto,
      joinPending,
      joined,
      loaded,
      phase,
      presentation.pageTitle,
      presentation.profileBadgeLabel,
      refresh,
      seasonId,
      participateSyncVersion,
    ]
  );
}
