'use client';

import { CheckCircle2, Gift, Sparkles, Trophy } from 'lucide-react';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import { PortalBadge } from '@/components/ui/portal-badge';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { SurfacePanel } from '@/components/ui/surface-panel';

type ProgressItem = {
  label: string;
  value: string;
};

type BoostProgressionLayerProps = {
  isConnected: boolean;
  isLoading: boolean;
  totalEarnedDisplay: string;
  claimableDisplay: string;
  dailyEarnedDisplay: string;
  dailyRemainingDisplay: string;
  progressItems: ProgressItem[];
};

export function BoostProgressionLayer({
  isConnected,
  isLoading,
  totalEarnedDisplay,
  claimableDisplay,
  dailyEarnedDisplay,
  dailyRemainingDisplay,
  progressItems,
}: BoostProgressionLayerProps) {
  return (
    <SurfacePanel radius="xl" tone="soft" className="mt-4 p-4 md:p-5">
      <div className="flex flex-col gap-2.5 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <PortalBadge accent="green" size="sm">
              Social Activity
            </PortalBadge>
          </div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] md:text-xl">
            Rewards Progress
          </h2>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Live rewards activity from on-chain data.
          </p>
        </div>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <div className="flex min-h-20 items-center justify-center border-t border-fade-section py-3">
            <PulsingDots size="md" />
          </div>
        ) : (
          <StatStrip columns={4}>
            <StatStripCell
              label="Collected"
              icon={Gift}
              iconClassName="portal-slate-icon"
              showDivider
            >
              <p className="portal-slate-text font-mono text-sm font-semibold tracking-tight md:text-base">
                {isConnected ? totalEarnedDisplay : '—'}
              </p>
            </StatStripCell>
            <StatStripCell
              label="Ready"
              icon={Sparkles}
              iconClassName="portal-green-icon"
              showDivider
            >
              <p className="portal-green-text font-mono text-base font-bold tracking-tight md:text-lg">
                {isConnected ? claimableDisplay : '—'}
              </p>
            </StatStripCell>
            <StatStripCell
              label="Today"
              icon={CheckCircle2}
              iconClassName="portal-green-icon"
              showDivider
            >
              <p
                className={
                  isConnected && dailyEarnedDisplay !== '0'
                    ? 'portal-green-text text-sm font-semibold md:text-base'
                    : 'portal-slate-text text-sm font-semibold md:text-base'
                }
              >
                {isConnected ? dailyEarnedDisplay : '—'}
              </p>
            </StatStripCell>
            <StatStripCell
              label="Daily Cap Remaining"
              icon={Trophy}
              iconClassName="portal-purple-icon"
            >
              <p className="portal-slate-text font-mono text-sm font-semibold tracking-tight md:text-base">
                {isConnected ? dailyRemainingDisplay : '—'}
              </p>
            </StatStripCell>
          </StatStrip>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="uppercase tracking-[0.16em]">Progress</span>
        {progressItems.map((item, index) => (
          <span key={item.label} className="inline-flex items-center gap-2">
            {index > 0 ? <span className="text-border">•</span> : null}
            <span>
              <span className="text-muted-foreground">{item.label}</span>{' '}
              <span
                className={
                  item.label === 'Top source' || item.label === 'Claimed'
                    ? 'portal-purple-text'
                    : 'font-mono text-foreground'
                }
              >
                {item.value}
              </span>
            </span>
          </span>
        ))}
      </div>
    </SurfacePanel>
  );
}
