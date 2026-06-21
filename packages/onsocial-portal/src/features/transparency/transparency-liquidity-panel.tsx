'use client';

import { ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { BoostPanelSectionTitle } from '@/features/boost/boost-panel-section-title';
import {
  MARKET_LIQUIDITY_POOLS,
  TRANSPARENCY_NETWORK,
} from '@/features/transparency/transparency-constants';
import { formatTokenAmount } from '@/features/transparency/transparency-format';
import { TransparencyMiniTokenIcon } from '@/features/transparency/transparency-mini-token-icon';
import {
  TRANSPARENCY_PANEL_DIVIDER_CLASS,
  TRANSPARENCY_PANEL_PADDING_CLASS,
  TRANSPARENCY_PULSE_VALUE_ROW_CLASS,
} from '@/features/transparency/transparency-page-column';
import type { TransparencyLiquidityPool } from '@/features/transparency/use-transparency-data';
import { cn } from '@/lib/utils';

function PulseDivider({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('hidden h-4 w-px shrink-0 bg-border/50 sm:block', className)}
    />
  );
}

function LiquidityPulseItem({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 basis-[calc(50%-0.375rem)] flex-col items-center text-center sm:min-w-[4.5rem] sm:flex-1 sm:basis-auto">
      <span className="portal-type-micro text-muted-foreground/70">{label}</span>
      <div className={TRANSPARENCY_PULSE_VALUE_ROW_CLASS}>
        {loading ? (
          <Skeleton className="h-5 w-12 rounded-full bg-foreground/[0.06]" />
        ) : (
          <span className="font-mono text-sm font-semibold tabular-nums tracking-tight text-foreground">
            {value}
          </span>
        )}
      </div>
    </div>
  );
}

function LiquidityPoolRow({
  href,
  configLabel,
  pool,
  tokenIconSrc,
  tokenSymbol,
  loading,
}: {
  href: string;
  configLabel: string;
  pool: TransparencyLiquidityPool | undefined;
  tokenIconSrc: string | null;
  tokenSymbol: string;
  loading?: boolean;
}) {
  const pairedSymbol = pool?.pairedSymbol ?? configLabel.split('-')[1] ?? 'Token';
  const pairLabel = `${tokenSymbol}-${pairedSymbol}`;

  return (
    <div className="flex min-h-[2.75rem] items-center gap-2.5 py-2 first:pt-0 last:pb-0">
      <div className="relative h-6 w-8 shrink-0">
        <TransparencyMiniTokenIcon
          src={tokenIconSrc}
          label={tokenSymbol}
          className="absolute left-0 top-0 z-10 h-4 w-4 ring-2 ring-background"
        />
        <TransparencyMiniTokenIcon
          src={pool?.pairedIcon}
          label={pairedSymbol}
          className="absolute left-3 top-2 z-0 h-4 w-4 ring-2 ring-background"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium tracking-tight text-foreground">
          {pairLabel}
        </p>
        {loading ? (
          <Skeleton className="mt-1 h-3 w-28 rounded-full bg-foreground/[0.06]" />
        ) : (
          <p className="mt-0.5 truncate font-mono portal-type-micro tabular-nums text-muted-foreground">
            {pool
              ? `${pool.socialAmount} ${tokenSymbol} · ${pool.pairedAmount} ${pairedSymbol}`
              : '—'}
          </p>
        )}
      </div>
      <a
        href={pool?.href ?? href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted/20 text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground"
        aria-label={`Open ${pairLabel} pool on Rhea`}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

export function TransparencyLiquidityPanel({
  pools,
  totalSocialInPools,
  tokenIconSrc,
  tokenSymbol,
  loading = false,
  className,
}: {
  pools: TransparencyLiquidityPool[];
  totalSocialInPools: bigint;
  tokenIconSrc: string | null;
  tokenSymbol: string;
  loading?: boolean;
  className?: string;
}) {
  if (TRANSPARENCY_NETWORK !== 'mainnet') {
    return null;
  }

  const socialInPoolsDisplay =
    pools.length > 0
      ? formatTokenAmount(totalSocialInPools.toString(), 18, 3)
      : '—';
  const poolCountDisplay =
    pools.length > 0 ? pools.length.toString() : '—';

  return (
    <SurfacePanel
      radius="xl"
      tone="soft"
      padding="none"
      className={cn(TRANSPARENCY_PANEL_PADDING_CLASS, className)}
    >
      <BoostPanelSectionTitle align="center">Market liquidity</BoostPanelSectionTitle>

      <div className={TRANSPARENCY_PANEL_DIVIDER_CLASS}>
        <div className="flex w-full flex-wrap items-center justify-center gap-3 sm:justify-between sm:gap-2">
          <LiquidityPulseItem
            label="SOCIAL in pools"
            value={socialInPoolsDisplay}
            loading={loading}
          />
          <PulseDivider />
          <LiquidityPulseItem
            label="Pools"
            value={poolCountDisplay}
            loading={loading}
          />
          <PulseDivider />
          <LiquidityPulseItem label="Source" value="Ref v2" />
        </div>
      </div>

      <div className={cn('divide-y divide-fade-detail', TRANSPARENCY_PANEL_DIVIDER_CLASS)}>
        {MARKET_LIQUIDITY_POOLS.map((config) => {
          const pool = pools.find((entry) => entry.poolId === config.poolId);

          return (
            <LiquidityPoolRow
              key={config.poolId}
              href={config.href}
              configLabel={config.label}
              pool={pool}
              tokenIconSrc={tokenIconSrc}
              tokenSymbol={tokenSymbol}
              loading={loading}
            />
          );
        })}
      </div>
    </SurfacePanel>
  );
}
