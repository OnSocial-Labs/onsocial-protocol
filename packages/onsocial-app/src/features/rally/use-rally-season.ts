'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSeasonParticipation } from '@/contexts/season-participation-context';
import { fetchWalletSocialBalanceYocto } from '@/features/boost/boost-position';
import {
  fetchJoinRallyMinYocto,
  fetchRallyClaim,
  fetchRallyMe,
  fetchRallyRegistry,
  fetchRallyStatus,
  formatJoinRallyMinLabel,
  formatRallyMarkCaption,
  resolveRallyLifecyclePhase,
  resolveRallyOccasion,
  resolveRallyPresentation,
  type RallyClaimRecord,
  type RallyLifecyclePhase,
  type RallyRegistryEntry,
  type RallyStanding,
} from '@/lib/rally-season';

const REGISTRY_REFRESH_MS = 60_000;

export type RallyOccasion = {
  loaded: boolean;
  entry: RallyRegistryEntry | null;
  seasonId: string | null;
  pageTitle: string;
  profileBadgeLabel: string;
};

export type RallyMarkState = {
  loaded: boolean;
  visible: boolean;
  nudge: boolean;
  label: string;
  ariaLabel: string;
};

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

export type RallySeasonState = {
  occasion: RallyOccasion;
  mark: RallyMarkState;
  player: RallyPlayerState;
  refresh: () => void;
};

function parseStatusMinYocto(raw: string | null | undefined): bigint | null {
  if (!raw) return null;
  try {
    const yocto = BigInt(raw);
    return yocto > 0n ? yocto : null;
  } catch {
    return null;
  }
}

function phaseFromEntry(
  entry: RallyRegistryEntry | null
): RallyLifecyclePhase | null {
  if (!entry) return null;
  if (entry.is_live) return 'live';
  if (entry.claim_open) return 'claim_open';
  return null;
}

export function useRallySeason(
  accountId: string | null,
  detail: boolean
): RallySeasonState {
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
  const [occasionLoaded, setOccasionLoaded] = useState(false);
  const [entry, setEntry] = useState<RallyRegistryEntry | null>(null);
  const [standing, setStanding] = useState<RallyStanding | null>(null);
  const [apiClaim, setApiClaim] = useState<RallyClaimRecord | null>(null);
  const [snapshotLoaded, setSnapshotLoaded] = useState(!accountId);
  const [phase, setPhase] = useState<RallyLifecyclePhase | null>(null);
  const [joinMinYocto, setJoinMinYocto] = useState<bigint | null>(null);
  const [balanceYocto, setBalanceYocto] = useState<bigint | null>(null);
  const [chainLabel, setChainLabel] = useState<string | null>(null);
  const [detailLoaded, setDetailLoaded] = useState(!detail);
  const [detailGate, setDetailGate] = useState(detail);
  const [tracked, setTracked] = useState({
    seasonId: null as string | null,
    accountId,
  });

  const refresh = useCallback(() => {
    setReloadNonce((value) => value + 1);
  }, []);

  const seasonId = entry?.seasonId ?? null;
  if (tracked.seasonId !== seasonId || tracked.accountId !== accountId) {
    setTracked({ seasonId, accountId });
    setStanding(null);
    setApiClaim(null);
    setSnapshotLoaded(!seasonId || !accountId);
    setPhase(phaseFromEntry(entry));
    setJoinMinYocto(null);
    setBalanceYocto(null);
    setChainLabel(null);
    setDetailLoaded(!detail);
  }
  if (detailGate !== detail) {
    setDetailGate(detail);
    if (detail) setDetailLoaded(false);
  }

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const registry = await fetchRallyRegistry();
      if (cancelled) return;
      setEntry(resolveRallyOccasion(registry));
      setOccasionLoaded(true);
    };
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, REGISTRY_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [reloadNonce]);

  useEffect(() => {
    if (!seasonId || !accountId) return;
    let cancelled = false;
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
      setSnapshotLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    accountId,
    reconcileSeasonClaimFromApi,
    reconcileSeasonJoinFromApi,
    reloadNonce,
    seasonId,
  ]);

  useEffect(() => {
    if (!detail || !seasonId) return;
    let cancelled = false;
    void (async () => {
      const [status, chainMin, balance] = await Promise.all([
        fetchRallyStatus(seasonId),
        fetchJoinRallyMinYocto(),
        accountId
          ? fetchWalletSocialBalanceYocto(accountId).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setChainLabel(status?.onChainConfig?.label ?? null);
      setPhase(
        resolveRallyLifecyclePhase(
          status?.onChainConfig ?? null,
          status?.settlement ?? null
        ) ?? phaseFromEntry(entry)
      );
      setJoinMinYocto(chainMin ?? parseStatusMinYocto(status?.joinMinYocto));
      setBalanceYocto(balance);
      setDetailLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, detail, entry, reloadNonce, seasonId]);

  const presentation = resolveRallyPresentation(
    seasonId ?? 'season-one',
    chainLabel ?? entry?.label
  );
  const joined = seasonId
    ? resolveSeasonJoinedFor(seasonId, Boolean(standing))
    : false;
  const claim = deriveSeasonClaim(apiClaim);
  const joinPending = seasonId ? isSeasonJoinPending(seasonId) : false;
  const claimPending = seasonId ? isSeasonClaimPending(seasonId) : false;
  const resolvedPhase = phase ?? phaseFromEntry(entry);
  const hasEnoughSocial =
    joinMinYocto != null &&
    balanceYocto != null &&
    balanceYocto >= joinMinYocto;
  const canJoin =
    Boolean(seasonId) &&
    resolvedPhase === 'live' &&
    !joined &&
    joinMinYocto != null &&
    (accountId == null || hasEnoughSocial);
  const canCollect =
    resolvedPhase === 'claim_open' && Boolean(claim && claim.claimed === false);
  const hasJoinOverride = seasonId ? hasSeasonJoinConfirmed(seasonId) : false;
  const hasClaimOverride = Boolean(
    seasonId && claim?.claimed && apiClaim && apiClaim.claimed !== true
  );

  useEffect(() => {
    if (!seasonId) return;
    if (!hasJoinOverride && !hasClaimOverride) return;
    const timers = [2_000, 5_000].map((ms) => window.setTimeout(refresh, ms));
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [hasClaimOverride, hasJoinOverride, refresh, seasonId]);

  const label = formatRallyMarkCaption({
    collectYocto: canCollect ? claim?.amountYocto : null,
    rank: joined ? standing?.rank : null,
  });
  const snapshotReady = !seasonId || !accountId || snapshotLoaded;
  const detailReady = !detail || !seasonId || detailLoaded;
  const loaded = occasionLoaded && snapshotReady && detailReady;

  return useMemo(() => {
    void participateSyncVersion;
    const occasion: RallyOccasion = {
      loaded: occasionLoaded,
      entry,
      seasonId,
      pageTitle: presentation.pageTitle,
      profileBadgeLabel: presentation.profileBadgeLabel,
    };
    const ariaLabel = !entry
      ? presentation.pageTitle
      : canCollect
        ? `${label || 'SOCIAL'} ready to collect from ${presentation.pageTitle}`
        : joined && label
          ? `${label} in ${presentation.pageTitle}`
          : canJoin
            ? `Join ${presentation.pageTitle}`
            : presentation.pageTitle;
    const mark: RallyMarkState = {
      loaded: occasionLoaded && snapshotReady,
      visible: Boolean(entry),
      nudge: Boolean(entry) && (canJoin || canCollect),
      label,
      ariaLabel,
    };
    const player: RallyPlayerState = {
      loaded,
      seasonId: seasonId ?? '',
      pageTitle: presentation.pageTitle,
      profileBadgeLabel: presentation.profileBadgeLabel,
      phase: resolvedPhase,
      joined,
      standing,
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
    };
    return { occasion, mark, player, refresh };
  }, [
    balanceYocto,
    canCollect,
    canJoin,
    claim,
    claimPending,
    entry,
    hasEnoughSocial,
    joinMinYocto,
    joinPending,
    joined,
    label,
    loaded,
    occasionLoaded,
    participateSyncVersion,
    presentation.pageTitle,
    presentation.profileBadgeLabel,
    refresh,
    resolvedPhase,
    seasonId,
    snapshotReady,
    standing,
  ]);
}
