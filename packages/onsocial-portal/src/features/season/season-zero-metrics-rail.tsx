'use client';

import type { ComponentType, ReactNode } from 'react';
import { Clock, Coins, Users } from 'lucide-react';
import {
  formatGenesisSeasonTimeRemaining,
  formatGenesisYoctoAsSocial,
} from '@/lib/genesis-season';
import {
  resolveSeasonZeroLifecyclePhase,
  type SeasonZeroOnChainConfig,
  type SeasonZeroSettlementSummary,
} from '@/features/season/season-zero-types';
import { cn } from '@/lib/utils';

const PHASE_COPY: Record<
  ReturnType<typeof resolveSeasonZeroLifecyclePhase>,
  {
    title: string;
    accent: 'gold' | 'blue' | 'green' | 'neutral';
  }
> = {
  live: { title: 'Live', accent: 'gold' },
  ended_pending_settlement: { title: 'Ended', accent: 'blue' },
  finalized_pending_publish: { title: 'Finalized', accent: 'blue' },
  published_claim_soon: { title: 'Published', accent: 'green' },
  claim_open: { title: 'Claims open', accent: 'green' },
};

const ACCENT_ICON: Record<
  (typeof PHASE_COPY)[keyof typeof PHASE_COPY]['accent'],
  string
> = {
  gold: 'portal-gold-icon',
  blue: 'portal-blue-icon',
  green: 'portal-green-icon',
  neutral: 'portal-neutral-icon',
};

const ACCENT_FRAME: Record<
  (typeof PHASE_COPY)[keyof typeof PHASE_COPY]['accent'],
  string
> = {
  gold: 'portal-gold-frame',
  blue: 'portal-blue-frame',
  green: 'portal-green-frame',
  neutral: 'border-border/45 bg-background/40',
};

const ACCENT_VALUE: Record<
  (typeof PHASE_COPY)[keyof typeof PHASE_COPY]['accent'],
  string
> = {
  gold: 'portal-gold-text',
  blue: 'portal-blue-text',
  green: 'portal-green-text',
  neutral: 'text-portal-neutral',
};

function readEndsAtNs(
  onChain: SeasonZeroOnChainConfig | null | undefined
): number {
  if (!onChain?.ends_at_ns) return 0;
  const parsed = Number(onChain.ends_at_ns);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatParticipants(total: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    total
  );
}

function MetricSegment({
  icon: Icon,
  iconClassName,
  frameClassName,
  children,
  showDivider = false,
  iconPulse = false,
}: {
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  frameClassName: string;
  children: ReactNode;
  showDivider?: boolean;
  iconPulse?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 md:gap-3 md:px-4',
        showDivider && 'border-r border-fade-section'
      )}
    >
      <div className="relative shrink-0">
        {iconPulse ? (
          <span
            className="absolute inset-0 rounded-full bg-[var(--portal-gold)]/20 motion-safe:animate-ping"
            aria-hidden
          />
        ) : null}
        <div
          className={cn(
            'relative flex h-8 w-8 items-center justify-center rounded-full border',
            frameClassName
          )}
        >
          <Icon className={cn('h-3.5 w-3.5', iconClassName)} />
        </div>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function SeasonZeroMetricsRail({
  onChainConfig,
  indexedPoolYocto,
  settlement,
  participantCount = 0,
  className,
}: {
  onChainConfig: SeasonZeroOnChainConfig;
  indexedPoolYocto?: string;
  settlement?: SeasonZeroSettlementSummary | null;
  participantCount?: number;
  className?: string;
}) {
  const phase = resolveSeasonZeroLifecyclePhase(onChainConfig, settlement);
  const copy = PHASE_COPY[phase];
  const endsAtNs = readEndsAtNs(onChainConfig);
  const timeLabel =
    phase === 'live' && endsAtNs > 0
      ? formatGenesisSeasonTimeRemaining(endsAtNs)
      : null;
  const poolLabel = formatGenesisYoctoAsSocial(indexedPoolYocto ?? '0');
  const isLive = phase === 'live';

  return (
    <div className={className}>
      <div className="flex items-stretch">
        <MetricSegment
          icon={Clock}
          iconClassName={ACCENT_ICON[copy.accent]}
          frameClassName={ACCENT_FRAME[copy.accent]}
          showDivider
          iconPulse={isLive}
        >
          <p
            className={cn(
              'font-mono text-base font-bold tracking-tight',
              isLive ? ACCENT_VALUE.gold : ACCENT_VALUE[copy.accent]
            )}
          >
            {timeLabel ?? copy.title}
          </p>
          <p className="mt-0.5 portal-type-micro text-muted-foreground/65">
            Season clock
          </p>
        </MetricSegment>

        <MetricSegment
          icon={Coins}
          iconClassName="portal-gold-icon"
          frameClassName="portal-gold-frame"
          showDivider
        >
          <p className="truncate font-mono text-base font-bold tracking-tight text-foreground">
            {poolLabel}
            <span className="ml-1 text-sm font-semibold text-muted-foreground">
              SOCIAL
            </span>
          </p>
          <p className="mt-0.5 portal-type-micro text-muted-foreground/65">
            Join pool
          </p>
        </MetricSegment>

        <MetricSegment
          icon={Users}
          iconClassName="portal-purple-icon"
          frameClassName="portal-purple-frame"
        >
          <p className="font-mono text-base font-bold tracking-tight text-foreground">
            {formatParticipants(participantCount)}
          </p>
          <p className="mt-0.5 portal-type-micro text-muted-foreground/65">
            In the rally
          </p>
        </MetricSegment>
      </div>

      {settlement ? (
        <p className="border-t border-fade-section px-3 py-1.5 text-center portal-type-micro text-muted-foreground/65 md:px-4">
          Settlement {settlement.status}
          {settlement.publishedTxHash ? ' · root on-chain' : ''}
        </p>
      ) : null}
    </div>
  );
}
