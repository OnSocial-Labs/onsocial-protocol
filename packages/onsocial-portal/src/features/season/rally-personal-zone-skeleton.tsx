import { RallyPositionSummarySkeleton } from '@/features/season/rally-position-summary';
import { RallyCollectZoneSkeleton } from '@/features/season/rally-collect-zone-skeleton';
import type { RallyCollectZonePreview } from '@/features/season/rally-collect-preview';
import {
  resolveCollectedZoneMinClass,
  resolveRallyJoinedFooterMinClass,
} from '@/features/season/season-page-column';
import { cn } from '@/lib/utils';

/** Standing + collect CTA placeholder — matches joined footer layout. */
export function RallyPersonalZoneSkeleton({
  className,
  reserveRewardSlot = true,
  rewardSlotLoading = false,
  collectPreview = 'collected',
  rewardShownInStanding = false,
  reserveTxLink = false,
}: {
  className?: string;
  reserveRewardSlot?: boolean;
  rewardSlotLoading?: boolean;
  collectPreview?: RallyCollectZonePreview;
  rewardShownInStanding?: boolean;
  reserveTxLink?: boolean;
}) {
  const collectedMinClass = resolveCollectedZoneMinClass({
    rewardShownInStanding,
    reserveTxLink,
  });

  return (
    <div
      className={cn(
        resolveRallyJoinedFooterMinClass(collectPreview),
        className
      )}
    >
      <RallyPositionSummarySkeleton
        reserveRewardSlot={reserveRewardSlot}
        rewardSlotLoading={rewardSlotLoading}
      />
      <RallyCollectZoneSkeleton
        preview={collectPreview}
        collectedMinClass={collectedMinClass}
        reserveTxLink={reserveTxLink}
      />
    </div>
  );
}
