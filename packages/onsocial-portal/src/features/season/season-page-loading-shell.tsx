import { PageShell } from '@/components/layout/page-shell';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { RallyHeroCardSkeleton } from '@/features/season/rally-hero-card-skeleton';
import { RallyStandingsHeaderSkeleton } from '@/features/season/rally-standings-header';
import { SeasonArchiveNavSkeleton } from '@/features/season/season-archive-nav-skeleton';
import {
  resolveRallyHeroCardMinClass,
  resolveSeasonPageLoadingShellStandings,
  SEASON_PANEL_DIVIDER_CLASS,
  SEASON_PANEL_PADDING_CLASS,
  SeasonPageColumn,
} from '@/features/season/season-page-column';
import { StandingRowSkeleton } from '@/features/season/season-zero-standing-row';
import type { SeasonPhase } from '@/lib/season-registry';
import { cn } from '@/lib/utils';

export function SeasonPageLoadingShell({
  registryPhase = 'live',
  participantHint = 0,
}: {
  /** Match post-live archived/claim pages to client standings skeleton. */
  registryPhase?: SeasonPhase | null;
  /** When known — avoids row-count flash on hydrate (e.g. Rally #3 = 2). */
  participantHint?: number;
} = {}) {
  const standingsShell = resolveSeasonPageLoadingShellStandings({
    registryPhase,
    participantHint,
  });

  return (
    <PageShell size="section">
      <SeasonArchiveNavSkeleton className="mb-1" />
      <SeasonPageColumn>
        <SurfacePanel
          radius="xl"
          tone="soft"
          borderTone="subtle"
          padding="none"
          className={cn(
            'overflow-hidden border-border/40',
            resolveRallyHeroCardMinClass('none')
          )}
        >
          <RallyHeroCardSkeleton footerPreview="none" />
        </SurfacePanel>

        <SurfacePanel
          radius="xl"
          tone="soft"
          padding="none"
          className={`border-border/40 ${SEASON_PANEL_PADDING_CLASS}`}
        >
          <RallyStandingsHeaderSkeleton />
          <div
            className={cn(
              `divide-y divide-fade-detail ${SEASON_PANEL_DIVIDER_CLASS}`,
              standingsShell.listMinClass
            )}
          >
            {Array.from({ length: standingsShell.rowCount }).map((_, index) => (
              <StandingRowSkeleton
                key={index}
                reserveRewardSlot={standingsShell.reserveRewardSlot}
              />
            ))}
          </div>
        </SurfacePanel>
      </SeasonPageColumn>
    </PageShell>
  );
}
