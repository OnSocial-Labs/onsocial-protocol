'use client';

import { cn } from '@/lib/utils';

export type CompactInlineProgressTone = 'activity' | 'claim';

export interface CompactInlineProgressRowProps {
  label: string;
  ratioLabel: string;
  value: number;
  max: number;
  loading?: boolean;
  tone?: CompactInlineProgressTone;
  /** Claim header row uses slightly wider label/ratio spacing. */
  spacing?: 'default' | 'relaxed';
  className?: string;
}

export const compactInlineProgressGridClass =
  'grid grid-cols-[minmax(0,4.5rem)_1fr] items-center gap-x-2 gap-y-1 portal-type-label';

export const compactInlineProgressTrackClass =
  'col-span-2 h-1 min-w-0 overflow-hidden rounded-full';

function progressFillClass(
  empty: boolean,
  complete: boolean,
  tone: CompactInlineProgressTone
): string {
  if (tone === 'claim') return 'bg-[var(--portal-green)]';
  if (empty) return 'bg-border/65';
  if (complete) return 'bg-[var(--portal-green)]';
  return 'bg-[var(--portal-gold)]';
}

function progressTrackClass(tone: CompactInlineProgressTone): string {
  return tone === 'claim' ? 'bg-[var(--portal-green-bg)]' : 'bg-border/50';
}

/** Rules-modal inline row shared by rally scoring and portal rewards. */
export function CompactInlineProgressRow({
  label,
  ratioLabel,
  value,
  max,
  loading = false,
  tone = 'activity',
  spacing = 'default',
  className,
}: CompactInlineProgressRowProps) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const empty = value <= 0;
  const complete = max > 0 && value >= max;
  const minFillPct = tone === 'claim' ? 3 : 6;

  return (
    <div
      className={cn(
        compactInlineProgressGridClass,
        spacing === 'relaxed' && 'gap-x-3 gap-y-1.5',
        className
      )}
    >
      <span className="min-w-0 font-medium text-foreground">{label}</span>
      {loading ? (
        <span
          className="h-3.5 w-10 justify-self-end animate-pulse rounded bg-muted/35"
          aria-hidden
        />
      ) : (
        <span
          className={cn(
            'justify-self-end text-right font-mono portal-type-caption tabular-nums text-muted-foreground',
            complete && 'text-[var(--portal-green)]',
            empty && 'text-muted-foreground/55'
          )}
        >
          {ratioLabel}
        </span>
      )}
      <div
        className={cn(
          compactInlineProgressTrackClass,
          progressTrackClass(tone)
        )}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${label}: ${ratioLabel}`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300',
            loading && 'animate-pulse bg-muted/35',
            !loading && progressFillClass(empty, complete, tone),
            tone === 'claim' &&
              complete &&
              'shadow-[0_0_10px_-2px_var(--portal-green-shadow)]'
          )}
          style={{
            width: loading
              ? '18%'
              : `${pct > 0 ? Math.max(pct, minFillPct) : 0}%`,
          }}
        />
      </div>
    </div>
  );
}
