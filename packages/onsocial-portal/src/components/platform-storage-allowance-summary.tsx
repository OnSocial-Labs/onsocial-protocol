'use client';

import {
  formatCompactBytes,
  PLATFORM_STORAGE_INACTIVE_HINT,
  PLATFORM_STORAGE_LABEL,
  PLATFORM_STORAGE_REFILL_HINT,
  type PlatformStorageSummary,
} from '@/lib/platform-storage-display';
import { ModalFactRow } from '@/components/ui/modal-fact-list';
import { cn } from '@/lib/utils';

function AllowanceProgressBar({
  summary,
}: {
  summary: PlatformStorageSummary;
}) {
  const low = summary.availablePercent <= 25 && summary.availableBytes > 0;
  const empty = summary.availableBytes === 0;
  const fill =
    summary.availableBytes > 0 ? Math.max(summary.availablePercent, 4) : 0;

  return (
    <div
      className="mb-3 space-y-1.5"
      role="progressbar"
      aria-valuenow={summary.availableBytes}
      aria-valuemin={0}
      aria-valuemax={summary.maxBufferBytes}
      aria-label={`${formatCompactBytes(summary.availableBytes)} platform storage available of ${formatCompactBytes(summary.maxBufferBytes)} buffer`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
          {formatCompactBytes(summary.availableBytes)}
        </span>
        <span className="font-mono portal-type-label tabular-nums text-muted-foreground/55">
          / {formatCompactBytes(summary.maxBufferBytes)} buffer
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-[var(--portal-slate-bg)]">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300',
            empty
              ? 'bg-muted-foreground/25'
              : low
                ? 'bg-[var(--portal-amber)]'
                : 'bg-[var(--portal-blue)]'
          )}
          style={{ width: `${fill}%` }}
        />
      </div>
    </div>
  );
}

export function PlatformStorageAllowanceSummary({
  variant = 'full',
  loading,
  error,
  summary,
}: {
  /** `accountFacts` — inline bar only, no duplicate fact rows. */
  variant?: 'full' | 'accountFacts';
  loading: boolean;
  error: string | null;
  summary: PlatformStorageSummary | null;
}) {
  if (variant === 'accountFacts') {
    return (
      <WalletPlatformStorageStrip
        compact
        hideLabel
        loading={loading}
        error={error}
        summary={summary}
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-2 py-1">
        <div className="h-5 w-28 animate-pulse rounded bg-muted/40" />
        <div className="h-1 w-full animate-pulse rounded-full bg-muted/30" />
        <div className="h-3 w-full animate-pulse rounded bg-muted/25" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-1 portal-type-body-sm text-muted-foreground/55">
        {error}
      </p>
    );
  }

  if (!summary) {
    return (
      <p className="py-1 portal-type-body-sm text-muted-foreground/55">
        Unavailable
      </p>
    );
  }

  if (summary.phase === 'inactive') {
    return (
      <div className="space-y-2 py-0.5">
        <p className="portal-type-body-sm leading-snug text-muted-foreground/65">
          {PLATFORM_STORAGE_INACTIVE_HINT}
        </p>
        <dl className="divide-y divide-fade-item">
          <ModalFactRow
            label="First grant"
            value={formatCompactBytes(summary.onboardingBytes)}
            valueMono
          />
          <ModalFactRow
            label="Refill rate"
            value={`+${formatCompactBytes(summary.dailyRefillBytes)} / day`}
            valueMono
          />
          <ModalFactRow
            label="Buffer cap"
            value={formatCompactBytes(summary.maxBufferBytes)}
            valueMono
          />
        </dl>
        <p className="portal-type-label leading-snug text-muted-foreground/45">
          {PLATFORM_STORAGE_REFILL_HINT}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5 py-0.5">
      <AllowanceProgressBar summary={summary} />

      <dl className="divide-y divide-fade-item">
        <ModalFactRow
          label="Available now"
          value={`${formatCompactBytes(summary.availableBytes)} of ${formatCompactBytes(summary.maxBufferBytes)}`}
          valueMono
        />
        <ModalFactRow
          label="Stored on platform"
          value={formatCompactBytes(summary.storedBytes)}
          valueMono
        />
        <ModalFactRow
          label="Refill rate"
          value={`+${formatCompactBytes(summary.dailyRefillBytes)} / day`}
          valueMono
        />
      </dl>

      {summary.phase === 'exhausted' ? (
        <p className="pt-1 portal-type-label leading-snug text-[var(--portal-amber)]">
          Buffer empty — refills over time, or deposit NEAR for immediate
          storage.
        </p>
      ) : (
        <p className="pt-1 portal-type-label leading-snug text-muted-foreground/45">
          {PLATFORM_STORAGE_REFILL_HINT}
        </p>
      )}
    </div>
  );
}

/** Slim wallet-menu readout — bar + ratio, matches claim progress styling. */
export function WalletPlatformStorageStrip({
  compact = false,
  hideLabel = false,
  loading,
  error,
  summary,
}: {
  compact?: boolean;
  hideLabel?: boolean;
  loading: boolean;
  error: string | null;
  summary: PlatformStorageSummary | null;
}) {
  if (loading) {
    return (
      <div className="space-y-1" aria-hidden>
        <div className="flex justify-between gap-2">
          <div className="h-3 w-12 animate-pulse rounded bg-muted/30" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted/30" />
        </div>
        <div className="h-1 w-full animate-pulse rounded-full bg-muted/30" />
      </div>
    );
  }

  if (error || !summary) {
    return null;
  }

  if (summary.phase === 'inactive') {
    return (
      <p
        className={cn(
          'leading-snug text-muted-foreground/50',
          compact
            ? 'portal-type-micro md:portal-type-caption'
            : 'portal-type-caption'
        )}
      >
        {PLATFORM_STORAGE_LABEL} · activates on first save
      </p>
    );
  }

  const low = summary.availablePercent <= 25 && summary.availableBytes > 0;
  const empty = summary.availableBytes === 0;
  const fill =
    summary.availableBytes > 0 ? Math.max(summary.availablePercent, 3) : 0;
  const ratioLabel = `${formatCompactBytes(summary.availableBytes)} / ${formatCompactBytes(summary.maxBufferBytes)}`;
  const metaLabel = `${formatCompactBytes(summary.storedBytes)} stored · +${formatCompactBytes(summary.dailyRefillBytes)}/day`;

  if (compact) {
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          {!hideLabel ? (
            <span className="shrink-0 portal-type-micro font-medium text-muted-foreground/50 md:portal-type-caption">
              {PLATFORM_STORAGE_LABEL}
            </span>
          ) : null}
          <div
            className="flex min-h-[1rem] min-w-0 flex-1 items-center"
            role="progressbar"
            aria-valuenow={summary.availableBytes}
            aria-valuemin={0}
            aria-valuemax={summary.maxBufferBytes}
            aria-label={`${ratioLabel} platform storage buffer available`}
          >
            <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--portal-slate-bg)]">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-300',
                  empty
                    ? 'bg-muted-foreground/25'
                    : low
                      ? 'bg-[var(--portal-amber)]'
                      : 'bg-[var(--portal-blue)]'
                )}
                style={{ width: `${fill}%` }}
              />
            </div>
          </div>
          <span
            className={cn(
              'shrink-0 font-mono portal-type-micro tabular-nums leading-none md:portal-type-caption',
              empty || summary.phase === 'exhausted'
                ? 'text-[var(--portal-amber)]'
                : low
                  ? 'text-[var(--portal-amber)]/85'
                  : 'text-muted-foreground/50'
            )}
          >
            {ratioLabel}
          </span>
        </div>
        <p className="portal-type-micro leading-none text-muted-foreground/40 md:portal-type-caption">
          {metaLabel}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="portal-type-caption font-medium text-muted-foreground/55">
          {PLATFORM_STORAGE_LABEL}
        </span>
        <span
          className={cn(
            'font-mono portal-type-caption tabular-nums leading-none',
            empty || summary.phase === 'exhausted'
              ? 'text-[var(--portal-amber)]'
              : low
                ? 'text-[var(--portal-amber)]/85'
                : 'text-muted-foreground/55'
          )}
        >
          {ratioLabel}
        </span>
      </div>

      <div
        className="flex min-h-[1rem] items-center md:min-h-[1.25rem]"
        role="progressbar"
        aria-valuenow={summary.availableBytes}
        aria-valuemin={0}
        aria-valuemax={summary.maxBufferBytes}
        aria-label={`${ratioLabel} platform storage buffer available`}
      >
        <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--portal-slate-bg)]">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300',
              empty
                ? 'bg-muted-foreground/25'
                : low
                  ? 'bg-[var(--portal-amber)]'
                  : 'bg-[var(--portal-blue)]'
            )}
            style={{ width: `${fill}%` }}
          />
        </div>
      </div>

      <p className="portal-type-caption leading-snug text-muted-foreground/45">
        {metaLabel}
      </p>
    </div>
  );
}
