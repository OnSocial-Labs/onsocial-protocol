import { PageShell } from '@/components/layout/page-shell';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { RallyStandingsHeaderSkeleton } from '@/features/season/rally-standings-header';
import { RallyHeroHeaderSkeleton } from '@/features/season/rally-hero-header';
import { SeasonPageColumn } from '@/features/season/season-page-column';
import {
  SEASON_PANEL_DIVIDER_CLASS,
  SEASON_PANEL_PADDING_CLASS,
} from '@/features/season/season-page-column';
import { SeasonRallyMetricsSkeleton } from '@/features/season/season-rally-metrics-skeleton';
import { StandingRowSkeleton } from '@/features/season/season-zero-standing-row';

export function SeasonPageLoadingShell() {
  return (
    <PageShell size="section">
      <SeasonPageColumn>
        <SurfacePanel
          radius="xl"
          tone="solid"
          borderTone="strong"
          padding="none"
          className="overflow-hidden border-border/40 bg-background/30"
        >
          <RallyHeroHeaderSkeleton />
          <SeasonRallyMetricsSkeleton showFooter={false} />
        </SurfacePanel>

        <SurfacePanel
          radius="xl"
          tone="soft"
          padding="none"
          className={`border-border/40 ${SEASON_PANEL_PADDING_CLASS}`}
        >
          <RallyStandingsHeaderSkeleton />
          <div
            className={`divide-y divide-fade-detail ${SEASON_PANEL_DIVIDER_CLASS}`}
          >
            {Array.from({ length: 5 }).map((_, index) => (
              <StandingRowSkeleton key={index} />
            ))}
          </div>
        </SurfacePanel>
      </SeasonPageColumn>
    </PageShell>
  );
}
