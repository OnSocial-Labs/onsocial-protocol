'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Trophy } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { Button } from '@/components/ui/button';
import { PortalBadge } from '@/components/ui/portal-badge';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { useWallet } from '@/contexts/wallet-context';
import { GenesisRallyStrip } from '@/features/season/genesis-rally-strip';
import { GENESIS_RALLY_JOIN_SOCIAL_LABEL } from '@/lib/genesis-season';
import { cn } from '@/lib/utils';

interface SeasonZeroStanding {
  rank: number;
  accountId: string;
  joinedAtNs: string;
  joinAmountYocto: string;
  joinCount: number;
  eligible: boolean;
  score: number;
  breakdown: {
    join: number;
    profile: number;
    endorsements: number;
    solidarity: number;
    support: number;
    boost: number;
    total: number;
  };
  profile: {
    hasName: boolean;
    hasBio: boolean;
    hasAvatar: boolean;
    linkCount: number;
  };
  signals: {
    uniqueEndorsers: number;
    endorsementTopics: number;
    receivedStands: number;
    mutualStands: number;
    supportReceivedYocto: string;
    effectiveBoostYocto: string;
  };
}

interface SeasonZeroStandingsResponse {
  success: boolean;
  total: number;
  standings: SeasonZeroStanding[];
  error?: string;
}

const SCORE_LABELS: Array<keyof SeasonZeroStanding['breakdown']> = [
  'join',
  'profile',
  'endorsements',
  'solidarity',
  'support',
  'boost',
];

function formatScore(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    value
  );
}

function formatAccount(accountId: string): string {
  return accountId.replace(/\.onsocial\.(testnet|near)$/u, '');
}

function ScoreBreakdown({ standing }: { standing: SeasonZeroStanding }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
      {SCORE_LABELS.map((key) => (
        <div
          key={key}
          className="rounded-xl border border-border/40 bg-background/30 px-3 py-2"
        >
          <p className="capitalize text-muted-foreground">{key}</p>
          <p className="mt-1 font-mono font-semibold text-foreground">
            {formatScore(standing.breakdown[key])}
          </p>
        </div>
      ))}
    </div>
  );
}

function StandingRow({
  standing,
  isCurrentUser,
}: {
  standing: SeasonZeroStanding;
  isCurrentUser: boolean;
}) {
  return (
    <SurfacePanel
      radius="xl"
      tone="soft"
      padding="snug"
      className={cn('border-border/40', isCurrentUser && 'portal-gold-panel')}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PortalBadge
              accent={standing.rank <= 3 ? 'gold' : 'neutral'}
              size="sm"
            >
              #{standing.rank}
            </PortalBadge>
            {isCurrentUser ? (
              <PortalBadge accent="green" size="sm">
                You
              </PortalBadge>
            ) : null}
            <p className="truncate text-sm font-semibold text-foreground">
              {formatAccount(standing.accountId)}
            </p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {standing.signals.uniqueEndorsers} endorsers,{' '}
            {standing.signals.receivedStands} stands,{' '}
            {standing.signals.mutualStands} mutual
          </p>
        </div>
        <div className="shrink-0 md:text-right">
          <p className="font-mono text-lg font-bold text-foreground">
            {formatScore(standing.score)}
          </p>
          <p className="text-xs text-muted-foreground">points</p>
        </div>
      </div>
      <ScoreBreakdown standing={standing} />
    </SurfacePanel>
  );
}

export default function SeasonZeroPage() {
  const { accountId } = useWallet();
  const [standings, setStandings] = useState<SeasonZeroStanding[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentUserStanding = useMemo(
    () =>
      standings.find((standing) => standing.accountId === accountId) ?? null,
    [accountId, standings]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        '/api/seasons/season-zero/standings?limit=25',
        { cache: 'no-store' }
      );
      const data = (await response.json()) as SeasonZeroStandingsResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? 'Could not load Season 0 standings.');
      }
      setStandings(data.standings ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load standings.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <PageShell size="section">
      <SecondaryPageHeader
        badge="Season 0"
        badgeAccent="gold"
        glowAccents={['gold', 'purple']}
        title="Genesis Rally"
        description={`Join with ${GENESIS_RALLY_JOIN_SOCIAL_LABEL} SOCIAL, complete your profile, receive genuine endorsements and stands, then watch your rank update from indexed chain data.`}
      />

      <div className="mx-auto max-w-5xl space-y-4">
        <GenesisRallyStrip />

        <div className="grid gap-4 md:grid-cols-3">
          <SurfacePanel radius="xl" tone="soft" className="md:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Trophy className="portal-gold-icon h-4 w-4" />
                  <h2 className="text-lg font-semibold tracking-tight">
                    Standings
                  </h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Read-only preview. Settlement and claims come after test flow
                  validation.
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="h-9"
                loading={loading}
                onClick={() => void refresh()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
          </SurfacePanel>

          <SurfacePanel radius="xl" tone="soft">
            <p className="portal-eyebrow text-muted-foreground">Participants</p>
            <p className="mt-2 font-mono text-3xl font-bold text-foreground">
              {formatScore(total)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Eligible accounts indexed so far.
            </p>
          </SurfacePanel>
        </div>

        {currentUserStanding ? (
          <div>
            <p className="mb-2 px-1 text-sm font-medium text-muted-foreground">
              Your standing
            </p>
            <StandingRow standing={currentUserStanding} isCurrentUser />
          </div>
        ) : accountId ? (
          <SurfacePanel radius="xl" tone="soft">
            <p className="text-sm font-medium text-foreground">
              You are not in the Season 0 standings yet.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Join the rally and wait for the indexer to catch up.
            </p>
          </SurfacePanel>
        ) : null}

        {error ? (
          <SurfacePanel radius="xl" tone="soft" className="border-red-500/30">
            <p className="text-sm text-red-500">{error}</p>
          </SurfacePanel>
        ) : null}

        <div className="space-y-3">
          {loading && standings.length === 0 ? (
            <SurfacePanel radius="xl" tone="soft">
              <p className="text-sm text-muted-foreground">
                Loading Season 0 standings...
              </p>
            </SurfacePanel>
          ) : null}
          {standings.map((standing) => (
            <StandingRow
              key={standing.accountId}
              standing={standing}
              isCurrentUser={standing.accountId === accountId}
            />
          ))}
        </div>
      </div>
    </PageShell>
  );
}
