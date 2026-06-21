import { Skeleton } from '@/components/ui/skeleton';
import { RallyCollectedFooterFrame } from '@/features/season/rally-collected-footer';
import {
  SEASON_COLLECT_ACTION_ROW_CLASS,
  SEASON_COLLECT_RALLY_ACTION_MIN_CLASS,
  SEASON_PERSONAL_REWARD_PAD_CLASS,
  resolveCollectedZoneMinClass,
} from '@/features/season/season-page-column';
import type { RallyCollectZonePreview } from '@/features/season/rally-collect-preview';
import { cn } from '@/lib/utils';

export type { RallyCollectZonePreview } from '@/features/season/rally-collect-preview';
export { resolveRallyCollectZonePreview } from '@/features/season/rally-collect-preview';

function CollectButtonSkeleton() {
  return (
    <Skeleton className="h-9 w-[8rem] rounded-full bg-foreground/[0.06]" />
  );
}

/** Mirrors CollectActionZone — celebration stage + button row. */
function CollectActionZoneSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative flex w-full flex-col items-center justify-end overflow-visible',
        SEASON_COLLECT_RALLY_ACTION_MIN_CLASS,
        className
      )}
    >
      <div
        className={cn(
          'flex w-full items-center justify-center',
          SEASON_COLLECT_ACTION_ROW_CLASS
        )}
      >
        <CollectButtonSkeleton />
      </div>
    </div>
  );
}

/** Matches final collect / collected footer layout — no shape swap on load. */
export function RallyCollectZoneSkeleton({
  preview = 'collected',
  shell = 'full',
  collectedMinClass,
  reserveTxLink = true,
  className,
}: {
  preview?: RallyCollectZonePreview;
  shell?: 'full' | 'inner';
  collectedMinClass?: string;
  reserveTxLink?: boolean;
  className?: string;
}) {
  const resolvedCollectedMinClass =
    collectedMinClass ??
    resolveCollectedZoneMinClass({
      reserveTxLink: reserveTxLink && preview === 'collected',
    });
  const collectedInner = (
    <RallyCollectedFooterFrame pending reserveTxLink={reserveTxLink} />
  );

  if (shell === 'inner') {
    if (preview === 'button') {
      return <CollectActionZoneSkeleton className={className} />;
    }

    return (
      <div className={cn('flex w-full flex-col items-center', className)}>
        {collectedInner}
      </div>
    );
  }

  if (preview === 'button') {
    return (
      <div
        className={cn(
          'flex flex-col items-center text-center',
          SEASON_PERSONAL_REWARD_PAD_CLASS,
          className
        )}
      >
        <CollectActionZoneSkeleton />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        SEASON_PERSONAL_REWARD_PAD_CLASS,
        resolvedCollectedMinClass,
        className
      )}
    >
      {collectedInner}
    </div>
  );
}
