'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { Button } from '@/components/ui/button';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { useWallet } from '@/contexts/wallet-context';
import { GenesisRallyStrip } from '@/features/season/genesis-rally-strip';
import { type SeasonZeroScoringLimits } from '@/features/season/season-zero-earn-panel';
import { SeasonZeroGuidePanel } from '@/features/season/season-zero-guide-panel';
import {
  StandingRow,
  StandingRowSkeleton,
  type SeasonZeroStanding,
} from '@/features/season/season-zero-standing-row';
import {
  resolveSeasonZeroLifecyclePhase,
  type SeasonZeroClaimPayload,
  type SeasonZeroClaimRecord,
  type SeasonZeroOnChainConfig,
  type SeasonZeroSettlementSummary,
  type SeasonZeroStatusPayload,
} from '@/features/season/season-zero-types';
import { fadeUpMotion } from '@/lib/motion';
import {
  ARCHIVED_GENESIS_SEASON_ID,
  getActiveSeasonId,
  seasonApiPath,
} from '@/lib/active-season';

interface SeasonZeroStandingsResponse {
  success: boolean;
  total: number;
  scoring?: SeasonZeroScoringLimits;
  standings: SeasonZeroStanding[];
  error?: string;
}

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
  seasonId,
  pageBadge,
  pageTitle,
  pageDescription,
}: {
  seasonId: string;
  pageBadge: string;
  pageTitle: string;
  pageDescription: string;
}) {
  const { accountId } = useWallet();
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentUserStanding = useMemo(
    () =>
      standings.find((standing) => standing.accountId === accountId) ?? null,
    [accountId, standings]
  );

  const seasonPhase = useMemo(
    () =>
      onChainConfig
        ? resolveSeasonZeroLifecyclePhase(onChainConfig, settlement)
        : null,
    [onChainConfig, settlement]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const claimUrl = accountId
        ? seasonApiPath(seasonId, `claims/${encodeURIComponent(accountId)}`)
        : null;

      const statusRes = await fetch(seasonApiPath(seasonId, 'status'), {
        cache: 'no-store',
      });
      const statusData = (await statusRes.json()) as SeasonZeroStatusPayload;
      const onChain = statusRes.ok ? (statusData.onChainConfig ?? null) : null;

      if (statusRes.ok && statusData.success !== false) {
        setOnChainConfig(onChain);
        setIndexedPoolYocto(statusData.indexedPoolYocto ?? '0');
        setJoinPoolYocto(statusData.joinPoolYocto ?? '0');
        setSponsoredPoolYocto(statusData.sponsoredPoolYocto ?? '0');
        setSettlement(statusData.settlement ?? null);
      }

      const standingsCutoff =
        onChain && !onChain.is_live && onChain.ends_at_ns
          ? `&cutoff_timestamp_ns=${encodeURIComponent(onChain.ends_at_ns)}`
          : '';

      const [standingsRes, claimRes] = await Promise.all([
        fetch(
          `${seasonApiPath(seasonId, 'standings')}?limit=25${standingsCutoff}`,
          {
            cache: 'no-store',
          }
        ),
        claimUrl
          ? fetch(claimUrl, { cache: 'no-store' })
          : Promise.resolve(null),
      ]);

      const standingsData =
        (await standingsRes.json()) as SeasonZeroStandingsResponse;
      if (!standingsRes.ok || !standingsData.success) {
        const body = standingsData as { error?: string; detail?: string };
        throw new Error(
          body.detail ?? body.error ?? 'Could not load Season 0 standings.'
        );
      }

      if (claimRes) {
        const claimData = (await claimRes.json()) as SeasonZeroClaimPayload;
        setClaim(claimRes.ok ? (claimData.claim ?? null) : null);
      } else {
        setClaim(null);
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
    }
  }, [accountId, seasonId]);

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
        badge={pageBadge}
        badgeAccent="gold"
        glowAccents={['gold', 'purple']}
        title={pageTitle}
        description={pageDescription}
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
            phase={seasonPhase}
            claim={claim}
            onParticipationChange={() => void refresh()}
            onClaimed={() => void refresh()}
          />
        </motion.div>

        {scoringLimits ? (
          <motion.div {...sectionEntrance(reduceMotion, 0.07)}>
            <SeasonZeroGuidePanel
              limits={scoringLimits}
              myStanding={currentUserStanding}
              participantCount={total}
              indexedPoolYocto={indexedPoolYocto}
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
              <p className="portal-eyebrow text-muted-foreground">Standings</p>
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

            {loading && standings.length === 0 ? (
              <div className="mt-3 divide-y divide-fade-item">
                {Array.from({ length: 5 }).map((_, index) => (
                  <StandingRowSkeleton key={index} />
                ))}
              </div>
            ) : (
              <div className="mt-3 divide-y divide-fade-item">
                {standings.map((standing) => (
                  <StandingRow key={standing.accountId} standing={standing} />
                ))}
              </div>
            )}
          </SurfacePanel>
        </motion.div>
      </div>
    </PageShell>
  );
}

export default function SeasonZeroPage() {
  return (
    <SeasonRallyPage
      seasonId={ARCHIVED_GENESIS_SEASON_ID}
      pageBadge="Season 0"
      pageTitle="Genesis Rally"
      pageDescription="Let the social games begin."
    />
  );
}

export function ActiveSeasonPage() {
  const seasonId = getActiveSeasonId();
  return (
    <SeasonRallyPage
      seasonId={seasonId}
      pageBadge="Live rally"
      pageTitle="Support Rally"
      pageDescription="Join the live season, earn points, and claim your share."
    />
  );
}
