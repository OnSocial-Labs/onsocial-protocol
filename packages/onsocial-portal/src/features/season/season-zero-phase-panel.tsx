'use client';

import { SurfacePanel } from '@/components/ui/surface-panel';
import { SeasonZeroMetricsRail } from '@/features/season/season-zero-metrics-rail';
import {
  resolveSeasonZeroLifecyclePhase,
  type SeasonZeroOnChainConfig,
  type SeasonZeroSettlementSummary,
} from '@/features/season/season-zero-types';
import { cn } from '@/lib/utils';

export function SeasonZeroPhasePanel({
  onChainConfig,
  indexedPoolYocto,
  settlement,
  participantCount = 0,
  className,
}: {
  onChainConfig?: SeasonZeroOnChainConfig | null;
  indexedPoolYocto?: string;
  settlement?: SeasonZeroSettlementSummary | null;
  participantCount?: number;
  className?: string;
}) {
  if (!onChainConfig) return null;

  const phase = resolveSeasonZeroLifecyclePhase(onChainConfig, settlement);
  const isLive = phase === 'live';

  return (
    <SurfacePanel
      radius="xl"
      tone="solid"
      borderTone="strong"
      padding="none"
      className={cn(
        'overflow-hidden',
        isLive &&
          'portal-gold-panel border-[var(--portal-gold-border-strong)] shadow-[0_0_16px_var(--portal-gold-glow)]',
        !isLive && 'border-border/40',
        className
      )}
    >
      <SeasonZeroMetricsRail
        onChainConfig={onChainConfig}
        indexedPoolYocto={indexedPoolYocto}
        settlement={settlement}
        participantCount={participantCount}
      />
    </SurfacePanel>
  );
}
