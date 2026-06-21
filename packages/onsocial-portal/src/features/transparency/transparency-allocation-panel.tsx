'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { SurfacePanel } from '@/components/ui/surface-panel';
import {
  TRANSPARENCY_PANEL_DIVIDER_CLASS,
  TRANSPARENCY_PANEL_PADDING_CLASS,
} from '@/features/transparency/transparency-page-column';
import { BoostPanelSectionTitle } from '@/features/boost/boost-panel-section-title';
import { getAccountExplorerLink } from '@/features/transparency/transparency-format';
import type { TransparencyDistributionEntry } from '@/features/transparency/use-transparency-data';
import { portalColors } from '@/lib/portal-colors';
import { cn } from '@/lib/utils';

function AllocationRow({
  entry,
  balanceDisplay,
  pctDisplay,
  loading,
}: {
  entry: TransparencyDistributionEntry;
  balanceDisplay: string;
  pctDisplay: string;
  loading?: boolean;
}) {
  const explorerLink = getAccountExplorerLink(entry.account);

  return (
    <div className="flex min-h-[2.75rem] items-center gap-2.5 py-2 first:pt-0 last:pb-0">
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: portalColors[entry.accent] }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium tracking-tight text-foreground">
          {entry.label}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {loading ? (
          <Skeleton className="ml-auto h-4 w-20 rounded-full bg-foreground/[0.06]" />
        ) : (
          <>
            <p className="font-mono text-xs font-semibold tabular-nums text-foreground">
              {balanceDisplay}
            </p>
            <p className="font-mono portal-type-micro tabular-nums text-muted-foreground">
              {pctDisplay}%
            </p>
          </>
        )}
      </div>
      {explorerLink ? (
        <a
          href={explorerLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted/20 text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground"
          aria-label={`Open ${entry.account} on explorer`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        <span className="h-7 w-7 shrink-0" aria-hidden />
      )}
    </div>
  );
}

export function TransparencyAllocationPanel({
  barDistribution,
  isTrackedBalanceLoaded,
  allocationLoaded,
  loading = false,
  className,
}: {
  barDistribution: TransparencyDistributionEntry[];
  isTrackedBalanceLoaded: (account: string) => boolean;
  allocationLoaded: boolean;
  loading?: boolean;
  className?: string;
}) {
  const distributionInteractionRef = useRef<HTMLDivElement>(null);
  const [hoveredDistributionIndex, setHoveredDistributionIndex] = useState<
    number | null
  >(null);
  const [selectedDistributionIndex, setSelectedDistributionIndex] = useState<
    number | null
  >(null);

  const activeDistributionIndex =
    selectedDistributionIndex ?? hoveredDistributionIndex;
  const activeDistribution =
    activeDistributionIndex !== null
      ? barDistribution[activeDistributionIndex]
      : null;

  useEffect(() => {
    if (selectedDistributionIndex === null) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const insideBar =
        distributionInteractionRef.current?.contains(target) ?? false;

      if (!insideBar) {
        setSelectedDistributionIndex(null);
        setHoveredDistributionIndex(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [selectedDistributionIndex]);

  return (
    <SurfacePanel
      radius="xl"
      tone="soft"
      padding="none"
      className={cn(TRANSPARENCY_PANEL_PADDING_CLASS, className)}
    >
      <BoostPanelSectionTitle align="center">
        Live allocation
      </BoostPanelSectionTitle>

      <div className={cn('relative mt-3', !loading && 'pt-8')}>
        {loading ? (
          <Skeleton className="h-4 w-full rounded-full bg-foreground/[0.06]" />
        ) : (
          <>
            {activeDistribution ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/95 px-3 py-1 backdrop-blur-sm">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: portalColors[activeDistribution.accent],
                    }}
                  />
                  <span className="portal-type-micro text-foreground/85">
                    {activeDistribution.label}
                  </span>
                  <span className="rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 font-mono portal-type-micro text-muted-foreground">
                    {activeDistribution.balanceDisplay} ·{' '}
                    {activeDistribution.pctOfSupplyDisplay}%
                  </span>
                </div>
              </div>
            ) : null}

            <div
              ref={distributionInteractionRef}
              className="overflow-hidden rounded-full bg-border/30"
              onMouseLeave={() => {
                if (selectedDistributionIndex === null) {
                  setHoveredDistributionIndex(null);
                }
              }}
            >
              <div className="flex h-[18px] items-center gap-px">
                {barDistribution.map((entry, index) => (
                  <button
                    key={entry.account}
                    type="button"
                    style={{
                      width: `${entry.pctOfSupply}%`,
                      backgroundColor: portalColors[entry.accent],
                      minWidth:
                        entry.balance && entry.balance > 0n ? '8px' : '0px',
                    }}
                    onMouseEnter={() => {
                      if (selectedDistributionIndex === null) {
                        setHoveredDistributionIndex(index);
                      }
                    }}
                    onFocus={() => {
                      if (selectedDistributionIndex === null) {
                        setHoveredDistributionIndex(index);
                      }
                    }}
                    onClick={() => {
                      setSelectedDistributionIndex((current) =>
                        current === index ? null : index
                      );
                      setHoveredDistributionIndex(index);
                    }}
                    onBlur={() =>
                      setHoveredDistributionIndex((current) => {
                        if (selectedDistributionIndex !== null) {
                          return current;
                        }
                        return current === index ? null : current;
                      })
                    }
                    aria-label={`${entry.label}: ${entry.balanceDisplay} SOCIAL, ${entry.pctOfSupplyDisplay}% of current supply`}
                    aria-pressed={selectedDistributionIndex === index}
                    className={cn(
                      'first:rounded-l-full last:rounded-r-full transition-all duration-200 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      selectedDistributionIndex === index
                        ? 'h-[18px] shadow-[0_0_0_1px_rgba(255,255,255,0.45)]'
                        : 'h-4'
                    )}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div
        className={cn(
          'divide-y divide-fade-detail',
          TRANSPARENCY_PANEL_DIVIDER_CLASS
        )}
      >
        {barDistribution.map((entry) => {
          const loaded =
            entry.account === 'other-holders'
              ? allocationLoaded
              : isTrackedBalanceLoaded(entry.account);

          return (
            <AllocationRow
              key={entry.account}
              entry={entry}
              balanceDisplay={entry.balanceDisplay}
              pctDisplay={entry.pctOfSupplyDisplay}
              loading={loading || !loaded}
            />
          );
        })}
      </div>
    </SurfacePanel>
  );
}
