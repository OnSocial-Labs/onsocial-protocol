'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { FloatingPanelMenu } from '@/components/ui/floating-panel-menu';
import { floatingPanelItemClass } from '@/components/ui/floating-panel';
import {
  archiveSeasonBadgeClassName,
  resolveArchiveSeasonBadge,
  type ArchiveSeasonClaimHint,
} from '@/features/season/season-archive-claim-hints';
import {
  SeasonArchiveNavSkeleton,
  SEASON_ARCHIVE_NAV_SLOT_CLASS,
  SEASON_ARCHIVE_NAV_LAYOUT_CLASS,
  SEASON_ARCHIVE_NAV_BUTTON_SHELL_CLASS,
  SeasonArchiveCollectDot,
} from '@/features/season/season-archive-nav-skeleton';
import { useArchiveSeasonClaimHints } from '@/features/season/use-archive-season-claim-hints';
import { useDropdown } from '@onsocial/ui';
import {
  listArchiveSeasons,
  resolveLiveSeasonEntry,
  type SeasonRegistryEntry,
  type SeasonRegistrySnapshot,
} from '@/lib/season-registry';
import { cn } from '@/lib/utils';

export function SeasonArchiveNav({
  currentSeasonId,
  registry,
  className,
  claimHintRefreshKey,
}: {
  currentSeasonId: string;
  registry: SeasonRegistrySnapshot | null;
  className?: string;
  /** Bumps when page claim state changes so archive badges stay in sync. */
  claimHintRefreshKey?: string | number;
}) {
  const archives = listArchiveSeasons(registry, currentSeasonId);
  const liveEntry = resolveLiveSeasonEntry(registry);
  const showLiveRallyLink =
    liveEntry != null && liveEntry.seasonId !== currentSeasonId;
  const hasClaimOpenArchives = archives.some((entry) => entry.claim_open);
  const { hints, hintsReady, hasCollectHint, walletConnected, refresh } =
    useArchiveSeasonClaimHints(archives);
  const { isOpen, toggle, close, containerRef } = useDropdown();
  const reserveCollectDot = hasClaimOpenArchives;
  const showCollectDot =
    reserveCollectDot && walletConnected && hasCollectHint && hintsReady;

  useEffect(() => {
    if (claimHintRefreshKey === undefined) {
      return;
    }
    void refresh();
  }, [claimHintRefreshKey, refresh]);

  useEffect(() => {
    if (isOpen) {
      void refresh();
    }
  }, [isOpen, refresh]);

  if (!registry) {
    return <SeasonArchiveNavSkeleton className={className} />;
  }

  if (archives.length === 0 && !showLiveRallyLink) {
    return null;
  }

  return (
    <div
      className={cn(
        SEASON_ARCHIVE_NAV_LAYOUT_CLASS,
        SEASON_ARCHIVE_NAV_SLOT_CLASS,
        className
      )}
    >
      <div className="flex min-w-0 justify-start">
        {showLiveRallyLink ? (
          <Link
            href={liveEntry.rallyPath}
            className={cn(
              SEASON_ARCHIVE_NAV_BUTTON_SHELL_CLASS,
              'max-w-full portal-gold-text transition-colors hover:bg-background/80 hover:opacity-90'
            )}
          >
            <span className="truncate">{liveEntry.label}</span>
          </Link>
        ) : null}
      </div>

      <div className="flex justify-center">
        {archives.length > 0 ? (
          <div className="relative" ref={containerRef}>
            <button
              type="button"
              onClick={toggle}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              aria-label={
                isOpen ? 'Close past seasons menu' : 'Open past seasons menu'
              }
              className={cn(
                SEASON_ARCHIVE_NAV_BUTTON_SHELL_CLASS,
                'transition-all duration-300 hover:bg-background/80 hover:text-foreground',
                isOpen
                  ? 'bg-background/88 text-foreground shadow-[0_12px_32px_-18px_rgba(15,23,42,0.38)]'
                  : undefined
              )}
            >
              <span className="truncate text-foreground/88">Past seasons</span>
              {reserveCollectDot ? (
                <SeasonArchiveCollectDot visible={showCollectDot} />
              ) : null}
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 shrink-0 transition-transform',
                  isOpen && 'rotate-180'
                )}
              />
            </button>

            <FloatingPanelMenu
              open={isOpen}
              align="center"
              className="w-[min(100vw-2rem,14rem)] sm:w-56"
              role="menu"
              aria-label="Past seasons"
            >
              <div className="border-b border-fade-section px-3 py-2.5 md:px-4 md:py-3">
                <p className="portal-type-label text-muted-foreground/70">
                  Past seasons
                </p>
              </div>
              <SeasonArchiveLinks
                entries={archives}
                hints={hints}
                hintsReady={hintsReady}
                walletConnected={walletConnected}
                onNavigate={close}
              />
            </FloatingPanelMenu>
          </div>
        ) : null}
      </div>

      <div aria-hidden />
    </div>
  );
}

export function SeasonArchiveLinks({
  entries,
  compact = false,
  hints = {},
  hintsReady = true,
  walletConnected = false,
  onNavigate,
}: {
  entries: SeasonRegistryEntry[];
  compact?: boolean;
  hints?: Record<string, ArchiveSeasonClaimHint>;
  hintsReady?: boolean;
  walletConnected?: boolean;
  onNavigate?: () => void;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <ul
      className={cn(
        'space-y-0.5 p-1 md:p-1.5',
        compact ? 'text-sm' : undefined
      )}
      role="none"
    >
      {entries.map((entry) => {
        const hint = hints[entry.seasonId];
        const itemHintsReady =
          hintsReady || !entry.claim_open || hint !== undefined;
        const badge = resolveArchiveSeasonBadge({
          entry,
          hint,
          hintsReady: itemHintsReady,
          walletConnected,
        });

        return (
          <li key={entry.seasonId} role="none">
            <Link
              href={entry.rallyPath}
              role="menuitem"
              onClick={onNavigate}
              className={cn(floatingPanelItemClass, 'justify-between gap-3')}
            >
              <span className="min-w-0 truncate">{entry.label}</span>
              {badge.tone === 'loading' ? (
                <span
                  className={archiveSeasonBadgeClassName(badge.tone)}
                  aria-hidden
                />
              ) : (
                <span className={archiveSeasonBadgeClassName(badge.tone)}>
                  {badge.label}
                </span>
              )}
            </Link>
          </li>
        );
      })}
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

  const badge = resolveArchiveSeasonBadge({
    entry,
    hintsReady: true,
    walletConnected: false,
  });

  return (
    <p className="-mt-4 mb-1 text-center text-sm text-muted-foreground">
      <Link
        href={entry.rallyPath}
        className="transition-colors hover:text-[var(--portal-gold)]"
      >
        View {entry.label} ({badge.label})
      </Link>
    </p>
  );
}
