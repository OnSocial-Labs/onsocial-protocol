'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import {
  listArchiveSeasons,
  resolveSeasonPhaseLabel,
  type SeasonRegistryEntry,
  type SeasonRegistrySnapshot,
} from '@/lib/season-registry';
import { cn } from '@/lib/utils';

export function SeasonArchiveNav({
  currentSeasonId,
  registry,
  className,
}: {
  currentSeasonId: string;
  registry: SeasonRegistrySnapshot | null;
  className?: string;
}) {
  const archives = listArchiveSeasons(registry, currentSeasonId);
  if (archives.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-center gap-2',
        className
      )}
    >
      <details className="group relative">
        <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full border border-border/50 bg-background/40 px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-[var(--portal-gold-border)] hover:text-foreground">
          Past seasons
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="absolute left-1/2 z-20 mt-2 min-w-[14rem] -translate-x-1/2 rounded-xl border border-border/50 bg-background/95 p-2 shadow-lg backdrop-blur">
          <SeasonArchiveLinks entries={archives} />
        </div>
      </details>
    </div>
  );
}

export function SeasonArchiveLinks({
  entries,
  compact = false,
}: {
  entries: SeasonRegistryEntry[];
  compact?: boolean;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <ul className={cn('space-y-1', compact ? 'text-sm' : 'text-sm')}>
      {entries.map((entry) => (
        <li key={entry.seasonId}>
          <Link
            href={entry.rallyPath}
            className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/40 hover:text-[var(--portal-gold)]"
          >
            <span className="truncate">{entry.label}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {resolveSeasonPhaseLabel(entry.phase)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function SeasonArchiveInlineLink({
  entry,
}: {
  entry: SeasonRegistryEntry | null;
}) {
  if (!entry) {
    return null;
  }

  return (
    <p className="-mt-4 mb-1 text-center text-sm text-muted-foreground">
      <Link
        href={entry.rallyPath}
        className="transition-colors hover:text-[var(--portal-gold)]"
      >
        View {entry.label} ({resolveSeasonPhaseLabel(entry.phase)})
      </Link>
    </p>
  );
}
