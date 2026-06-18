'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { Button } from '@/components/ui/button';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { useWallet } from '@/contexts/wallet-context';
import { useSeasonParticipation } from '@/contexts/season-participation-context';
import { GenesisRallyStrip } from '@/features/season/genesis-rally-strip';
import { type SeasonZeroScoringLimits } from '@/features/season/season-zero-earn-panel';
import { SeasonZeroGuidePanel } from '@/features/season/season-zero-guide-panel';
import {
  SEASON_ZERO_PAYOUT_STANDINGS_LIMIT,
  standingsToPayoutParticipants,
} from '@/features/season/season-zero-payout-estimate';
import {
  StandingRow,
  StandingRowSkeleton,
  type SeasonZeroStanding,
} from '@/features/season/season-zero-standing-row';
import {
  resolveSeasonZeroLifecyclePhase,
  isSeasonSettlementPublished,
  type SeasonZeroClaimPayload,
  type SeasonZeroClaimRecord,
  type SeasonZeroOnChainConfig,
  type SeasonZeroSettlementSummary,
  type SeasonZeroStatusPayload,
} from '@/features/season/season-zero-types';
import { fadeUpMotion, fadeMotion } from '@/lib/motion';
import {
  ARCHIVED_GENESIS_SEASON_ID,
  getActiveSeasonId,
  getSeasonPresentation,
  seasonApiPath,
} from '@/lib/active-season';
import { useSeasonRegistry } from '@/lib/season-registry';
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

const STANDINGS_DISPLAY_LIMIT = 25;

function sectionEntrance(
  reduceMotion: boolean | null,
  delay: number,
  distance = 12
) {
  return fadeUpMotion(Boolean(reduceMotion), {
    delay: reduceMotion ? 0 : delay,
    distance,
    duration: 0.28,
  });
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
  const { accountId } = useWallet();
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
  const [scoringLimits, setScoringLimits] =
    useState<SeasonZeroScoringLimits | null>(null);
  const [total, setTotal] = useState(0);
  const [onChainConfig, setOnChainConfig] =
    useState<SeasonZeroOnChainConfig | null>(null);
  const [indexedPoolYocto, setIndexedPoolYocto] = useState('0');
  const [joinPoolYocto, setJoinPoolYocto] = useState('0');
  const [sponsoredPoolYocto, setSponsoredPoolYocto] = useState('0');
  const [settlement, setSettlement] =
    useState<SeasonZeroSettlementSummary | null>(null);
  const [claim, setClaim] = useState<SeasonZeroClaimRecord | null>(null);
  const [publishedRewardByAccountId, setPublishedRewardByAccountId] = useState<
    Record<string, string>
  >({});
  const [claimStatusReady, setClaimStatusReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFirstLoadRef = useRef(true);

  const currentUserStanding = useMemo(
    () =>
      standings.find((standing) => standing.accountId === accountId) ?? null,
    [accountId, standings]
  );

  const payoutParticipants = useMemo(
    () => standingsToPayoutParticipants(standings),
    [standings]
  );

  const displayStandings = useMemo(
    () => standings.slice(0, STANDINGS_DISPLAY_LIMIT),
    [standings]
  );

  const seasonPhase = useMemo(
    () =>
      onChainConfig
        ? resolveSeasonZeroLifecyclePhase(onChainConfig, settlement)
        : null,
    [onChainConfig, settlement]
  );

  const showPublishedRewards = isSeasonSettlementPublished(settlement);

  const claimStatusReadyForUi =
    claimStatusReady &&
    hasLoadedOnce &&
    claimFetchedForAccountId === (accountId ?? null);

  const displayClaim = useMemo(
    () => deriveSeasonClaim(claim),
    [claim, deriveSeasonClaim, participateSyncVersion]
  );

  const refresh = useCallback(async () => {
    setError(null);
    if (isFirstLoadRef.current) {
      setLoading(true);
    }
    try {
      const claimUrl = accountId
        ? seasonApiPath(seasonId, `claims/${encodeURIComponent(accountId)}`)
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
        setOnChainConfig(onChain);
        setIndexedPoolYocto(statusData.indexedPoolYocto ?? '0');
        setJoinPoolYocto(statusData.joinPoolYocto ?? '0');
        setSponsoredPoolYocto(statusData.sponsoredPoolYocto ?? '0');
        setSettlement(nextSettlement);
      }

      const standingsCutoff =
        onChain && !onChain.is_live && onChain.ends_at_ns
          ? `&cutoff_timestamp_ns=${encodeURIComponent(onChain.ends_at_ns)}`
          : '';

      const rewardsUrl = isSeasonSettlementPublished(nextSettlement)
        ? `${seasonApiPath(seasonId, 'rewards')}?limit=${SEASON_ZERO_PAYOUT_STANDINGS_LIMIT}`
        : null;

      const [standingsRes, claimRes, rewardsRes] = await Promise.all([
        fetch(
          `${seasonApiPath(seasonId, 'standings')}?limit=${SEASON_ZERO_PAYOUT_STANDINGS_LIMIT}${standingsCutoff}`,
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
      ]);

      const standingsData =
        (await standingsRes.json()) as SeasonZeroStandingsResponse;
      if (!standingsRes.ok || !standingsData.success) {
        const body = standingsData as { error?: string; detail?: string };
        throw new Error(
          body.detail ?? body.error ?? 'Could not load rally standings.'
        );
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
      } else {
        setPublishedRewardByAccountId({});
      }

      setStandings(standingsData.standings ?? []);
      setScoringLimits(standingsData.scoring ?? null);
      setTotal(standingsData.total ?? 0);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load standings.'
      );
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
      setClaimFetchedForAccountId(accountId ?? null);
      setClaimStatusReady(true);
      isFirstLoadRef.current = false;
    }
  }, [accountId, reconcileSeasonClaimFromApi, seasonId]);

  useEffect(() => {
    isFirstLoadRef.current = true;
    setHasLoadedOnce(false);
    setClaimStatusReady(false);
    setClaimFetchedForAccountId(undefined);
    setClaim(null);
  }, [seasonId]);

  useEffect(() => {
    setClaim(null);
    setClaimStatusReady(false);
    setClaimFetchedForAccountId(undefined);
  }, [accountId]);

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
      <SecondaryPageHeader
        badge={presentation.pageBadge}
        badgeAccent="gold"
        glowAccents={['gold', 'purple']}
        title={presentation.pageTitle}
        description={presentation.pageDescription}
      />

      <SeasonArchiveNav
        currentSeasonId={seasonId}
        registry={registry}
        className="-mt-4 mb-1"
        claimHintRefreshKey={String(participateSyncVersion)}
      />

      <div className="mx-auto max-w-3xl space-y-3">
        <motion.div {...sectionEntrance(reduceMotion, 0)}>
          <GenesisRallyStrip
            variant="page"
            seasonId={seasonId}
            onChainConfig={onChainConfig}
            indexedPoolYocto={indexedPoolYocto}
            joinPoolYocto={joinPoolYocto}
            sponsoredPoolYocto={sponsoredPoolYocto}
            settlement={settlement}
            participantCount={total}
            myStanding={currentUserStanding}
            pageDataReady={hasLoadedOnce}
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
          />
        </motion.div>

        {scoringLimits ? (
          <motion.div {...sectionEntrance(reduceMotion, 0.07)}>
            <SeasonZeroGuidePanel
              limits={scoringLimits}
              myStanding={currentUserStanding}
              participantCount={total}
              indexedPoolYocto={indexedPoolYocto}
              payoutParticipants={payoutParticipants}
              personalAccountId={accountId}
            />
          </motion.div>
        ) : null}

        <motion.div {...sectionEntrance(reduceMotion, 0.12)}>
          <SurfacePanel
            radius="xl"
            tone="soft"
            padding="snug"
            className="border-border/40"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="portal-eyebrow text-muted-foreground">
                  Standings
                </p>
                {showPublishedRewards ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground/65">
                    Final SOCIAL rewards
                  </p>
                ) : null}
              </div>
              <Button
                size="xs"
                variant="secondary"
                loading={loading}
                onClick={() => void refresh()}
                className="gap-1.5"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </Button>
            </div>

            {error ? (
              <p className="mt-3 rounded-lg border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-sm text-[var(--portal-red)]">
                {error}
              </p>
            ) : null}

            <AnimatePresence mode="wait" initial={false}>
              {loading && standings.length === 0 ? (
                <motion.div
                  key="standings-loading"
                  {...fadeMotion(Boolean(reduceMotion) ? 0 : 0.18)}
                  className="mt-3 divide-y divide-fade-item"
                >
                  {Array.from({ length: 5 }).map((_, index) => (
                    <StandingRowSkeleton key={index} />
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="standings-loaded"
                  {...fadeMotion(Boolean(reduceMotion) ? 0 : 0.2)}
                  className="mt-3 divide-y divide-fade-item"
                >
                  {displayStandings.map((standing) => (
                    <StandingRow
                      key={standing.accountId}
                      standing={standing}
                      rewardAmountYocto={
                        showPublishedRewards
                          ? (publishedRewardByAccountId[standing.accountId] ??
                            null)
                          : null
                      }
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </SurfacePanel>
        </motion.div>
      </div>
    </PageShell>
  );
}

export default function SeasonZeroPage() {
  return <SeasonRallyPage seasonId={ARCHIVED_GENESIS_SEASON_ID} />;
}

export function ActiveSeasonPage() {
  return <SeasonRallyPage />;
}
