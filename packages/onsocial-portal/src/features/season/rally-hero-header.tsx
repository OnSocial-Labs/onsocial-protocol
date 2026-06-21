'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { SEASON_PANEL_PADDING_CLASS } from '@/features/season/season-page-column';
import { cn } from '@/lib/utils';

/** Single eyebrow row — skeleton + loaded text share one height. */
export const SEASON_RALLY_HERO_ROW_CLASS = 'flex min-h-3.5 items-center';

/** Reserved width for hero timing meta — prevents layout shift on load. */
export const SEASON_RALLY_HERO_TIMING_SLOT_CLASS =
  'min-w-[4.75rem] shrink-0 text-right sm:min-w-[6.25rem]';

const heroEyebrowClass = 'portal-eyebrow-wide leading-none';
const heroSkeletonClass = 'h-3.5 shrink-0 rounded-full bg-foreground/[0.06]';

export function RallyHeroHeader({
  displayTitle,
  timingMeta = null,
  timingMetaTitle = null,
  timingMetaLoading = false,
  className,
}: {
  displayTitle: string;
  /** Static calendar context (opens / ends / run window). */
  timingMeta?: string | null;
  /** Long-form timing for tooltips and screen readers. */
  timingMetaTitle?: string | null;
  timingMetaLoading?: boolean;
  className?: string;
}) {
  const showTimingMeta = timingMetaLoading || Boolean(timingMeta);

  return (
    <div
      className={cn(
        'border-b border-fade-detail',
        SEASON_PANEL_PADDING_CLASS,
        className
      )}
    >
      <div
        className={cn(
          SEASON_RALLY_HERO_ROW_CLASS,
          'justify-between gap-2 sm:gap-3'
        )}
      >
        <h1
          className={cn(
            heroEyebrowClass,
            'min-w-0 flex-1 truncate portal-gold-text'
          )}
        >
          {displayTitle}
        </h1>

        {showTimingMeta ? (
          <div
            className={cn(
              SEASON_RALLY_HERO_ROW_CLASS,
              SEASON_RALLY_HERO_TIMING_SLOT_CLASS,
              'justify-end'
            )}
          >
            {timingMetaLoading ? (
              <Skeleton
                className={cn(heroSkeletonClass, 'w-[4.75rem] sm:w-[6.25rem]')}
                aria-label="Loading season dates"
              />
            ) : (
              <p
                className={cn(
                  heroEyebrowClass,
                  'whitespace-nowrap text-muted-foreground/70'
                )}
                title={timingMetaTitle ?? timingMeta ?? undefined}
                aria-label={timingMetaTitle ?? timingMeta ?? undefined}
              >
                <span className="font-mono tabular-nums text-foreground/80">
                  {timingMeta}
                </span>
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function RallyHeroHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'border-b border-fade-detail',
        SEASON_PANEL_PADDING_CLASS,
        className
      )}
    >
      <div
        className={cn(
          SEASON_RALLY_HERO_ROW_CLASS,
          'justify-between gap-2 sm:gap-3'
        )}
      >
        <Skeleton
          className={cn(heroSkeletonClass, 'w-40 max-w-[55%] sm:w-44')}
        />
        <div
          className={cn(
            SEASON_RALLY_HERO_ROW_CLASS,
            SEASON_RALLY_HERO_TIMING_SLOT_CLASS,
            'justify-end'
          )}
        >
          <Skeleton
            className={cn(heroSkeletonClass, 'w-[4.75rem] sm:w-[6.25rem]')}
          />
        </div>
      </div>
    </div>
  );
}
