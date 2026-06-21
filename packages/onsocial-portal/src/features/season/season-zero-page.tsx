'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { PageShell } from '@/components/layout/page-shell';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { Skeleton } from '@/components/ui/skeleton';
import { useWallet } from '@/contexts/wallet-context';
import { useSeasonParticipation } from '@/contexts/season-participation-context';
import { usePageNavBadge } from '@/hooks/use-page-nav-badge';
import {
  formatRallyStandingsMeta,
  RallyStandingsHeader,
} from '@/features/season/rally-standings-header';
import { GenesisRallyStrip } from '@/features/season/genesis-rally-strip';
import { type SeasonZeroScoringLimits } from '@/features/season/season-zero-earn-panel';
import { SeasonZeroRulesModal } from '@/features/season/season-zero-rules-modal';
import {
  SEASON_PANEL_DIVIDER_CLASS,
  SEASON_PANEL_PADDING_CLASS,
  resolveStandingsReserveRewardSlot,
  resolveStandingsSkeletonRowCountForPage,
  standingsListMinClass,
  SeasonPageColumn,
} from '@/features/season/season-page-column';
import { standingsToPayoutParticipants } from '@/features/season/season-zero-payout-estimate';
import {
  StandingRow,
  StandingRowSkeleton,
  type SeasonZeroStanding,
} from '@/features/season/season-zero-standing-row';
import {
  isSeasonSettlementPublished,
  type SeasonTreasurySeedSource,
  type SeasonZeroClaimPayload,
  type SeasonZeroClaimRecord,
  type SeasonZeroOnChainConfig,
  type SeasonZeroSettlementSummary,
  type SeasonZeroStatusPayload,
} from '@/features/season/season-zero-types';
import { useSeasonZeroLifecyclePhase } from '@/features/season/use-season-zero-lifecycle-phase';
import {
  ARCHIVED_GENESIS_SEASON_ID,
  getActiveSeasonId,
  getSeasonCatalogTitle,
  getSeasonPresentation,
  resolveSeasonHeroTitle,
  seasonApiPath,
} from '@/lib/active-season';
import { useSeasonRegistry } from '@/lib/season-registry';
import { cn } from '@/lib/utils';
import { SeasonArchiveNav } from '@/features/season/season-archive-nav';

interface SeasonZeroStandingsResponse {
  success: boolean;
  total: number;
  scoring?: SeasonZeroScoringLimits;
  standings: SeasonZeroStanding[];
  error?: string;
}

interface SeasonPublishedRewardsResponse {
  success: boolean;
  total: number;
  rewards: Array<{
    accountId: string;
    rank: number;
    score: number;
    amountYocto: string;
  }>;
  error?: string;
}

interface SeasonZeroMeResponse {
  success: boolean;
  standing: SeasonZeroStanding | null;
  error?: string;
}

const STANDINGS_PAGE_SIZE = 20;
const PAYOUT_STANDINGS_LIMIT = 100;

function mergeStandingsByRank(
  current: SeasonZeroStanding[],
  incoming: SeasonZeroStanding[]
): SeasonZeroStanding[] {
  const byAccount = new Map(
    current.map((standing) => [standing.accountId, standing])
  );
  for (const standing of incoming) {
    byAccount.set(standing.accountId, standing);
  }
  return [...byAccount.values()].sort((a, b) => a.rank - b.rank);
}

export function SeasonRallyPage({
  seasonId: seasonIdProp,
}: {
  seasonId?: string;
}) {
  const { registry } = useSeasonRegistry();
  const fallbackSeasonId = getActiveSeasonId();
  const seasonId =
    seasonIdProp ??
    registry?.resolvedActiveSeasonId ??
    registry?.live?.seasonId ??
    fallbackSeasonId;
  const registryEntry =
    registry?.seasons.find((entry) => entry.seasonId === seasonId) ?? null;
  const presentation = getSeasonPresentation(seasonId, registryEntry);
  const { accountId, isLoading: walletLoading } = useWallet();
  const {
    deriveSeasonClaim,
    reconcileSeasonClaimFromApi,
    participateSyncVersion,
  } = useSeasonParticipation();
  const [claimFetchedForAccountId, setClaimFetchedForAccountId] = useState<
    string | null | undefined
  >(undefined);
  const reduceMotion = useReducedMotion();
  const [standings, setStandings] = useState<SeasonZeroStanding[]>([]);
  const [payoutStandings, setPayoutStandings] = useState<SeasonZeroStanding[]>(
    []
  );
  const [scoringLimits, setScoringLimits] =
    useState<SeasonZeroScoringLimits | null>(null);
  const [total, setTotal] = useState(0);
  const [standingsTotalHint, setStandingsTotalHint] = useState(0);
  const [hasMoreStandings, setHasMoreStandings] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const standingsCutoffRef = useRef('');
  const [onChainConfig, setOnChainConfig] =
    useState<SeasonZeroOnChainConfig | null>(null);
  const navTitle = useMemo(
    () =>
      resolveSeasonHeroTitle({
        seasonId,
        onChainLabel: onChainConfig?.label ?? registryEntry?.label,
        catalogTitle: getSeasonCatalogTitle(seasonId),
      }).title,
    [onChainConfig?.label, registryEntry?.label, seasonId]
  );
  usePageNavBadge(navTitle, 'gold');
  const [indexedPoolYocto, setIndexedPoolYocto] = useState('0');
  const [joinPoolYocto, setJoinPoolYocto] = useState('0');
  const [sponsoredPoolYocto, setSponsoredPoolYocto] = useState('0');
  const [treasurySeedSource, setTreasurySeedSource] =
    useState<SeasonTreasurySeedSource | null>(null);
  const [seasonJoinEntryYocto, setSeasonJoinEntryYocto] = useState<
    string | null
  >(null);
  const [settlement, setSettlement] =
    useState<SeasonZeroSettlementSummary | null>(null);
  const [claim, setClaim] = useState<SeasonZeroClaimRecord | null>(null);
  const [publishedRewardByAccountId, setPublishedRewardByAccountId] = useState<
    Record<string, string>
  >({});
  const [claimStatusReady, setClaimStatusReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [standingsEverLoaded, setStandingsEverLoaded] = useState(false);
  const [rewardsEverLoaded, setRewardsEverLoaded] = useState(false);
  const [loadedSeasonId, setLoadedSeasonId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myStandingFromMe, setMyStandingFromMe] =
    useState<SeasonZeroStanding | null>(null);
  const [syncedHeroStanding, setSyncedHeroStanding] =
    useState<SeasonZeroStanding | null>(null);
  const [pulseAccountId, setPulseAccountId] = useState<string | null>(null);
  const isFirstLoadRef = useRef(true);
  const seasonIdRef = useRef(seasonId);
  const resolvedWalletAccountRef = useRef<string | null | undefined>(undefined);
  const standingsPanelRef = useRef<HTMLDivElement>(null);

  seasonIdRef.current = seasonId;

  const pageDataReady = hasLoadedOnce && loadedSeasonId === seasonId;
  const standingsParticipantHint = standingsTotalHint || total;
  const standingsSkeletonRowCount = resolveStandingsSkeletonRowCountForPage({
    participantHint: standingsParticipantHint,
    registryPhase: registryEntry?.phase ?? null,
  });

  const currentUserStanding = useMemo(
    () =>
      standings.find((standing) => standing.accountId === accountId) ?? null,
    [accountId, standings]
  );

  const effectiveUserStanding =
    currentUserStanding ?? myStandingFromMe ?? syncedHeroStanding;

  const payoutParticipants = useMemo(
    () => standingsToPayoutParticipants(payoutStandings),
    [payoutStandings]
  );

  const displayStandings = standings;
  const seasonPhase = useSeasonZeroLifecyclePhase(onChainConfig, settlement);

  const showPublishedRewards = isSeasonSettlementPublished(settlement);

  const showStandingsSkeleton =
    walletLoading ||
    loading ||
    !standingsEverLoaded ||
    (showPublishedRewards && !rewardsEverLoaded);

  const standingsReserveRewardSlot = resolveStandingsReserveRewardSlot({
    showPublishedRewards,
    seasonPhase,
    registryPhase: registryEntry?.phase ?? null,
    standingsLoading: showStandingsSkeleton || loading,
  });

  const claimStatusReadyForUi =
    !walletLoading &&
    claimStatusReady &&
    pageDataReady &&
    claimFetchedForAccountId === (accountId ?? null);

  const displayClaim = useMemo(
    () => deriveSeasonClaim(claim),
    [claim, deriveSeasonClaim, participateSyncVersion]
  );

  const refresh = useCallback(async () => {
    const requestedSeasonId = seasonId;
    setError(null);
    if (isFirstLoadRef.current) {
      setLoading(true);
    }
    try {
      const claimUrl = accountId
        ? seasonApiPath(seasonId, `claims/${encodeURIComponent(accountId)}`)
        : null;
      const meUrl = accountId
        ? `${seasonApiPath(seasonId, 'me')}?account_id=${encodeURIComponent(accountId)}`
        : null;

      const statusRes = await fetch(seasonApiPath(seasonId, 'status'), {
        cache: 'no-store',
      });
      const statusData = (await statusRes.json()) as SeasonZeroStatusPayload;
      const onChain = statusRes.ok ? (statusData.onChainConfig ?? null) : null;
      const nextSettlement =
        statusRes.ok && statusData.success !== false
          ? (statusData.settlement ?? null)
          : null;

      if (statusRes.ok && statusData.success !== false) {
        if (requestedSeasonId !== seasonIdRef.current) return;
        setOnChainConfig(onChain);
        setIndexedPoolYocto(statusData.indexedPoolYocto ?? '0');
        setJoinPoolYocto(statusData.joinPoolYocto ?? '0');
        setSponsoredPoolYocto(statusData.sponsoredPoolYocto ?? '0');
        setSettlement(nextSettlement);
        setSeasonJoinEntryYocto(statusData.seasonJoinEntryYocto ?? null);
        setTreasurySeedSource(statusData.treasurySeedSource ?? null);
        setStandingsTotalHint(nextSettlement?.participantCount ?? 0);
      }

      const standingsCutoff =
        onChain && !onChain.is_live && onChain.ends_at_ns
          ? `&cutoff_timestamp_ns=${encodeURIComponent(onChain.ends_at_ns)}`
          : '';
      standingsCutoffRef.current = standingsCutoff;

      const rewardsUrl = isSeasonSettlementPublished(nextSettlement)
        ? `${seasonApiPath(seasonId, 'rewards')}?limit=${PAYOUT_STANDINGS_LIMIT}`
        : null;

      const [standingsRes, payoutStandingsRes, claimRes, rewardsRes, meRes] =
        await Promise.all([
          fetch(
            `${seasonApiPath(seasonId, 'standings')}?limit=${STANDINGS_PAGE_SIZE}&offset=0${standingsCutoff}`,
            {
              cache: 'no-store',
            }
          ),
          fetch(
            `${seasonApiPath(seasonId, 'standings')}?limit=${PAYOUT_STANDINGS_LIMIT}&offset=0${standingsCutoff}`,
            {
              cache: 'no-store',
            }
          ),
          claimUrl
            ? fetch(claimUrl, { cache: 'no-store' })
            : Promise.resolve(null),
          rewardsUrl
            ? fetch(rewardsUrl, { cache: 'no-store' })
            : Promise.resolve(null),
          meUrl ? fetch(meUrl, { cache: 'no-store' }) : Promise.resolve(null),
        ]);

      const standingsData =
        (await standingsRes.json()) as SeasonZeroStandingsResponse;
      const payoutStandingsData =
        (await payoutStandingsRes.json()) as SeasonZeroStandingsResponse;
      if (!standingsRes.ok || !standingsData.success) {
        const body = standingsData as { error?: string; detail?: string };
        throw new Error(
          body.detail ?? body.error ?? 'Could not load rally standings.'
        );
      }

      if (requestedSeasonId !== seasonIdRef.current) return;

      if (payoutStandingsRes.ok && payoutStandingsData.success) {
        setPayoutStandings(payoutStandingsData.standings ?? []);
      } else {
        setPayoutStandings(standingsData.standings ?? []);
      }

      if (claimRes) {
        const claimData = (await claimRes.json()) as SeasonZeroClaimPayload;
        const nextClaim = claimRes.ok ? (claimData.claim ?? null) : null;
        if (nextClaim) {
          reconcileSeasonClaimFromApi(seasonId, Boolean(nextClaim.claimed));
        }
        setClaim(nextClaim);
      } else {
        setClaim(null);
      }

      if (rewardsRes) {
        if (rewardsRes.ok) {
          const rewardsData =
            (await rewardsRes.json()) as SeasonPublishedRewardsResponse;
          const nextRewards: Record<string, string> = {};
          for (const reward of rewardsData.rewards ?? []) {
            nextRewards[reward.accountId] = reward.amountYocto;
          }
          setPublishedRewardByAccountId(nextRewards);
        } else {
          setPublishedRewardByAccountId({});
        }
        setRewardsEverLoaded(true);
      } else {
        setPublishedRewardByAccountId({});
        setRewardsEverLoaded(true);
      }

      if (meRes) {
        if (meRes.ok) {
          const meData = (await meRes.json()) as SeasonZeroMeResponse;
          const standing = meData.standing ?? null;
          if (standing && accountId) {
            const profileRes = await fetch(
              `/api/profile?accountId=${encodeURIComponent(accountId)}`,
              { cache: 'no-store' }
            ).catch(() => null);
            const profileData = profileRes?.ok
              ? ((await profileRes.json()) as {
                  profile?: { name?: string | null };
                  avatarUrl?: string | null;
                })
              : null;
            setMyStandingFromMe({
              ...standing,
              accountId: standing.accountId ?? accountId,
              displayName: profileData?.profile?.name ?? standing.displayName,
              avatarUrl: profileData?.avatarUrl ?? standing.avatarUrl,
            });
          } else {
            setMyStandingFromMe(standing);
          }
        } else {
          setMyStandingFromMe(null);
        }
      } else {
        setMyStandingFromMe(null);
      }

      const nextStandings = standingsData.standings ?? [];
      setStandings(nextStandings);
      setPulseAccountId(null);
      setScoringLimits(standingsData.scoring ?? null);
      const nextTotal = standingsData.total ?? 0;
      setTotal(nextTotal);
      setHasMoreStandings(nextStandings.length < nextTotal);
      setStandingsEverLoaded(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load standings.'
      );
    } finally {
      if (requestedSeasonId !== seasonIdRef.current) return;
      setLoading(false);
      setHasLoadedOnce(true);
      setLoadedSeasonId(requestedSeasonId);
      setClaimFetchedForAccountId(accountId ?? null);
      setClaimStatusReady(true);
      isFirstLoadRef.current = false;
    }
  }, [accountId, reconcileSeasonClaimFromApi, seasonId]);

  const loadMoreStandings = useCallback(async (): Promise<boolean> => {
    if (loading || isLoadingMore || !hasMoreStandings) return false;

    setIsLoadingMore(true);
    try {
      const standingsRes = await fetch(
        `${seasonApiPath(seasonId, 'standings')}?limit=${STANDINGS_PAGE_SIZE}&offset=${standings.length}${standingsCutoffRef.current}`,
        { cache: 'no-store' }
      );
      const standingsData =
        (await standingsRes.json()) as SeasonZeroStandingsResponse;
      if (!standingsRes.ok || !standingsData.success) {
        throw new Error('Could not load more standings.');
      }

      const nextPage = standingsData.standings ?? [];
      if (nextPage.length === 0) {
        setHasMoreStandings(false);
        return false;
      }

      setStandings((current) => {
        const merged = mergeStandingsByRank(current, nextPage);
        const nextTotal = standingsData.total ?? total;
        setHasMoreStandings(merged.length < nextTotal);
        return merged;
      });
      return true;
    } catch {
      return false;
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    hasMoreStandings,
    isLoadingMore,
    loading,
    seasonId,
    standings.length,
    total,
  ]);

  const loadStandingsAroundRank = useCallback(
    async (targetRank: number) => {
      const offset = Math.max(
        0,
        targetRank - Math.ceil(STANDINGS_PAGE_SIZE / 2)
      );
      const standingsRes = await fetch(
        `${seasonApiPath(seasonId, 'standings')}?limit=${STANDINGS_PAGE_SIZE}&offset=${offset}${standingsCutoffRef.current}`,
        { cache: 'no-store' }
      );
      const standingsData =
        (await standingsRes.json()) as SeasonZeroStandingsResponse;
      if (!standingsRes.ok || !standingsData.success) return;

      const nextPage = standingsData.standings ?? [];
      setStandings((current) => {
        const merged = mergeStandingsByRank(current, nextPage);
        const nextTotal = standingsData.total ?? total;
        setHasMoreStandings(merged.length < nextTotal);
        return merged;
      });
    },
    [seasonId, standings, total]
  );

  const jumpToStandings = useCallback(async () => {
    if (!effectiveUserStanding || !accountId) return;

    standingsPanelRef.current?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    });

    const inLoadedWindow = standings.some(
      (standing) => standing.accountId === accountId
    );
    if (!inLoadedWindow) {
      await loadStandingsAroundRank(effectiveUserStanding.rank);
    }

    setStandings((current) => {
      if (current.some((standing) => standing.accountId === accountId)) {
        return current;
      }
      return mergeStandingsByRank(current, [effectiveUserStanding]);
    });

    setPulseAccountId(accountId);
    window.setTimeout(() => setPulseAccountId(null), 2200);

    window.requestAnimationFrame(() => {
      document
        .querySelector(
          `#rally-standings [data-standing-account="${accountId}"]`
        )
        ?.scrollIntoView({
          behavior: reduceMotion ? 'auto' : 'smooth',
          block: 'center',
        });
    });
  }, [
    accountId,
    effectiveUserStanding,
    loadStandingsAroundRank,
    reduceMotion,
    standings,
  ]);

  const standingPulse =
    accountId != null && pulseAccountId != null && pulseAccountId === accountId;

  useEffect(() => {
    if (!hasMoreStandings || loading || isLoadingMore) return;

    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreStandings();
        }
      },
      { rootMargin: '180px', threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    displayStandings.length,
    hasMoreStandings,
    isLoadingMore,
    loadMoreStandings,
    loading,
  ]);

  useEffect(() => {
    isFirstLoadRef.current = true;
    resolvedWalletAccountRef.current = undefined;
    setLoading(true);
    setHasLoadedOnce(false);
    setStandingsEverLoaded(false);
    setRewardsEverLoaded(false);
    setStandingsTotalHint(0);
    setLoadedSeasonId(null);
    setClaimStatusReady(false);
    setClaimFetchedForAccountId(undefined);
    setClaim(null);
    setMyStandingFromMe(null);
    setSyncedHeroStanding(null);
    setSeasonJoinEntryYocto(null);
    setOnChainConfig(null);
    setSettlement(null);
    setIndexedPoolYocto('0');
    setJoinPoolYocto('0');
    setSponsoredPoolYocto('0');
    setTreasurySeedSource(null);
    setStandings([]);
    setPayoutStandings([]);
    setPublishedRewardByAccountId({});
    setScoringLimits(null);
    setTotal(0);
    setHasMoreStandings(false);
    setError(null);
  }, [seasonId]);

  useEffect(() => {
    if (walletLoading) return;

    const nextAccountId = accountId ?? null;
    if (resolvedWalletAccountRef.current === undefined) {
      resolvedWalletAccountRef.current = nextAccountId;
      return;
    }
    if (resolvedWalletAccountRef.current === nextAccountId) return;

    resolvedWalletAccountRef.current = nextAccountId;
    setClaim(null);
    setClaimStatusReady(false);
    setClaimFetchedForAccountId(undefined);
    setMyStandingFromMe(null);
    setSyncedHeroStanding(null);
  }, [accountId, walletLoading]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refresh();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return (
    <PageShell size="section">
      <SeasonArchiveNav
        currentSeasonId={seasonId}
        registry={registry}
        className="mb-1"
        claimHintRefreshKey={String(participateSyncVersion)}
      />

      <SeasonPageColumn>
        <GenesisRallyStrip
          variant="page"
          seasonId={seasonId}
          onChainConfig={onChainConfig}
          indexedPoolYocto={indexedPoolYocto}
          joinPoolYocto={joinPoolYocto}
          sponsoredPoolYocto={sponsoredPoolYocto}
          treasurySeedSource={treasurySeedSource}
          seasonJoinEntryYocto={seasonJoinEntryYocto}
          settlement={settlement}
          participantCount={total}
          myStanding={effectiveUserStanding}
          standingPulse={standingPulse}
          pageDataReady={pageDataReady}
          claimStatusReady={claimStatusReadyForUi}
          registryPhase={registryEntry?.phase ?? null}
          phase={seasonPhase}
          claim={displayClaim}
          payoutParticipants={payoutParticipants}
          publishedRewardByAccountId={publishedRewardByAccountId}
          personalAccountId={accountId}
          onParticipationChange={() => void refresh()}
          onClaimed={() => {
            void refresh();
          }}
          onOpenRules={() => setRulesOpen(true)}
          onJumpToStandings={() => void jumpToStandings()}
          onMyStandingChange={setSyncedHeroStanding}
        />

        <motion.div ref={standingsPanelRef}>
          <SurfacePanel
            id="rally-standings"
            radius="xl"
            tone="soft"
            padding="none"
            className={`border-border/40 ${SEASON_PANEL_PADDING_CLASS}`}
          >
            <RallyStandingsHeader
              meta={formatRallyStandingsMeta({
                loadedCount: displayStandings.length,
                total,
              })}
              showRules={Boolean(scoringLimits)}
              onOpenRules={() => setRulesOpen(true)}
              loading={showStandingsSkeleton}
              onRefresh={() => void refresh()}
            />

            {error ? (
              <p className="mt-3 rounded-lg border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-sm text-[var(--portal-red)]">
                {error}
              </p>
            ) : null}

            <div
              className={cn(
                `divide-y divide-fade-detail ${SEASON_PANEL_DIVIDER_CLASS}`,
                standingsListMinClass(
                  showStandingsSkeleton
                    ? standingsSkeletonRowCount
                    : Math.max(displayStandings.length, 1)
                )
              )}
            >
              {showStandingsSkeleton ? (
                Array.from({ length: standingsSkeletonRowCount }).map(
                  (_, index) => (
                    <StandingRowSkeleton
                      key={index}
                      reserveRewardSlot={standingsReserveRewardSlot}
                    />
                  )
                )
              ) : (
                <>
                  {displayStandings.map((standing) => (
                    <StandingRow
                      key={standing.accountId}
                      standing={standing}
                      isViewer={standing.accountId === accountId}
                      pulse={standing.accountId === pulseAccountId}
                      reserveRewardSlot={standingsReserveRewardSlot}
                      rewardAmountYocto={
                        showPublishedRewards
                          ? (publishedRewardByAccountId[standing.accountId] ??
                            null)
                          : null
                      }
                    />
                  ))}
                  {hasMoreStandings ? (
                    <div
                      ref={loadMoreSentinelRef}
                      className="flex min-h-12 items-center justify-center py-3"
                      aria-hidden={!isLoadingMore}
                    >
                      {isLoadingMore ? (
                        <Skeleton className="h-3 w-28 rounded-full bg-foreground/[0.06]" />
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </SurfacePanel>
        </motion.div>

        {scoringLimits ? (
          <SeasonZeroRulesModal
            open={rulesOpen}
            onOpenChange={setRulesOpen}
            limits={scoringLimits}
            myStanding={effectiveUserStanding}
            participantCount={total}
            indexedPoolYocto={indexedPoolYocto}
            payoutParticipants={payoutParticipants}
            personalAccountId={accountId}
            profileBadgeLabel={presentation.profileBadgeLabel}
          />
        ) : null}
      </SeasonPageColumn>
    </PageShell>
  );
}

export default function SeasonZeroPage() {
  return <SeasonRallyPage seasonId={ARCHIVED_GENESIS_SEASON_ID} />;
}

export function ActiveSeasonPage() {
  return <SeasonRallyPage />;
}
