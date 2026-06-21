'use client';

import Link from 'next/link';
import { Flame } from 'lucide-react';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { formatSocialCompact } from '@/lib/leaderboard';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Value row height — label + value slot; keeps pulse stable on load/refresh. */
export const BOOST_PULSE_VALUE_ROW_CLASS =
  'mt-0.5 flex min-h-5 items-center justify-center';

/** Mobile includes leaderboard link below stats. */
export const BOOST_PULSE_CONTAINER_CLASS =
  'min-h-[5.5rem] md:min-h-[3.25rem]';

function PulseDivider({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('hidden h-4 w-px shrink-0 bg-border/50 sm:block', className)}
    />
  );
}

function PulseItem({
  label,
  value,
  valueClassName,
  loading,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  loading?: boolean;
}) {
  return (
    <div className="flex min-w-[4.5rem] flex-1 flex-col items-center text-center sm:min-w-0">
      <span className="portal-type-micro text-muted-foreground/70">{label}</span>
      <div className={BOOST_PULSE_VALUE_ROW_CLASS}>
        {loading ? (
          <Skeleton className="h-5 w-12 rounded-full bg-foreground/[0.06]" />
        ) : (
          <span
            className={cn(
              'font-mono text-sm font-semibold tabular-nums tracking-tight text-foreground',
              valueClassName
            )}
          >
            {value}
          </span>
        )}
      </div>
    </div>
  );
}

export function BoostNetworkPulse({
  boosterCount,
  totalLockedYocto,
  scheduledPoolYocto,
  activeWeeklyRateBps,
  loading = false,
  className,
}: {
  boosterCount: number | null;
  totalLockedYocto: string;
  scheduledPoolYocto: string;
  activeWeeklyRateBps: number | null;
  loading?: boolean;
  className?: string;
}) {
  const boosters =
    boosterCount === null ? '—' : boosterCount.toLocaleString('en-US');
  const locked =
    totalLockedYocto === '0' ? '—' : formatSocialCompact(totalLockedYocto);
  const pool =
    scheduledPoolYocto === '0' ? '—' : formatSocialCompact(scheduledPoolYocto);
  const pace =
    activeWeeklyRateBps !== null
      ? `${(activeWeeklyRateBps / 100).toFixed(2)}%`
      : '—';

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/40 bg-background/30 px-3 py-2.5 sm:px-3.5',
        BOOST_PULSE_CONTAINER_CLASS,
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex w-full flex-wrap items-center justify-center gap-3 sm:flex-1 sm:justify-between sm:gap-2">
          <PulseItem label="Boosters" value={boosters} loading={loading} />
          <PulseDivider />
          <PulseItem label="Locked" value={locked} loading={loading} />
          <PulseDivider />
          <PulseItem
            label="Pool"
            value={pool}
            valueClassName="portal-blue-text"
            loading={loading}
          />
          <PulseDivider />
          <PulseItem
            label="Rate"
            value={pace}
            valueClassName="portal-gold-text"
            loading={loading}
          />
        </div>
        <div className="hidden min-h-7 items-center gap-1.5 rounded-full border border-border/35 bg-background/40 px-2.5 py-1 text-xs text-muted-foreground md:flex">
          <Flame className="portal-gold-icon h-3 w-3" />
          <span className="portal-type-micro">Network</span>
        </div>
      </div>
      <Link
        href="/boost/leaderboard"
        className="group mt-1.5 flex min-h-6 w-full items-center justify-center gap-1 border-t border-fade-detail pt-1.5 portal-type-micro text-muted-foreground/80 transition-colors hover:text-foreground md:hidden"
      >
        Leaderboard
        <ProtocolMotionArrow className="h-3 w-3" />
      </Link>
    </div>
  );
}
