import { RallyConnectFooterSkeleton } from '@/features/season/rally-connect-footer-skeleton';
import { RallyHeroHeaderSkeleton } from '@/features/season/rally-hero-header';
import type { RallyCollectZonePreview } from '@/features/season/rally-collect-preview';
import {
  RallyJoinFooterFrame,
  RallyJoinFooterSkeleton,
} from '@/features/season/rally-join-footer-skeleton';
import { RallyPersonalZoneSkeleton } from '@/features/season/rally-personal-zone-skeleton';
import { SeasonRallyMetricsSkeleton } from '@/features/season/season-rally-metrics-skeleton';
import {
  isPostLiveRegistryPhase,
  resolveRallyHeroCardMinClass,
  type RallyHeroFooterPreview,
} from '@/features/season/season-page-column';
import type { SeasonZeroLifecyclePhase } from '@/features/season/season-zero-types';
import { isPostLiveSeasonPhase } from '@/features/season/season-zero-claim-copy';
import type { SeasonPhase } from '@/lib/season-registry';

export type { RallyHeroFooterPreview };

type RallyFooterMode = 'loading' | 'joined' | 'post-live-connect' | 'join';

function isPostLiveBrowseContext(
  seasonPhase: SeasonZeroLifecyclePhase | null,
  registryPhase: SeasonPhase | null | undefined
): boolean {
  return (
    isPostLiveSeasonPhase(seasonPhase) ||
    (seasonPhase == null && isPostLiveRegistryPhase(registryPhase))
  );
}

/** Best-effort footer skeleton — mirrors resolved `footerMode` when still loading. */
export function resolveRallyHeroFooterPreview({
  footerMode,
  joined,
  seasonPhase,
  registryPhase = null,
  accountId,
  walletLoading,
  statusLoading,
  apiJoined,
  seasonIsUpcoming,
}: {
  footerMode: RallyFooterMode | null;
  joined: boolean;
  seasonPhase: SeasonZeroLifecyclePhase | null;
  registryPhase?: SeasonPhase | null;
  accountId: string | null;
  walletLoading: boolean;
  statusLoading: boolean;
  apiJoined: boolean;
  seasonIsUpcoming: boolean;
}): RallyHeroFooterPreview {
  if (footerMode === 'joined') return 'joined';
  if (footerMode === 'join') return 'join';
  if (footerMode === 'post-live-connect') return 'connect';
  if (footerMode === null) return 'none';

  const postLiveBrowse = isPostLiveBrowseContext(seasonPhase, registryPhase);

  if (joined) return 'joined';

  if (postLiveBrowse) {
    if (!walletLoading && !accountId) return 'connect';
    if (!statusLoading && !apiJoined) return 'none';
    return 'none';
  }

  if (
    seasonIsUpcoming ||
    seasonPhase === 'live' ||
    registryPhase === 'live' ||
    registryPhase === 'upcoming'
  ) {
    return 'join';
  }

  return 'none';
}

/** Full rally hero panel placeholder — header, pulse, footer matched to participation. */
export function RallyHeroCardSkeleton({
  footerPreview = 'none',
  collectPreview = 'collected',
  reserveRewardSlot = true,
  rewardSlotLoading = false,
  rewardShownInStanding = false,
  reserveTxLink = false,
  showBreakdownStrip = true,
}: {
  /** Which footer layout to reserve — `none` when user is not in the rally. */
  footerPreview?: RallyHeroFooterPreview;
  collectPreview?: RallyCollectZonePreview;
  reserveRewardSlot?: boolean;
  rewardSlotLoading?: boolean;
  rewardShownInStanding?: boolean;
  reserveTxLink?: boolean;
  showBreakdownStrip?: boolean;
} = {}) {
  return (
    <>
      <RallyHeroHeaderSkeleton />
      <SeasonRallyMetricsSkeleton
        showFooter={false}
        showBreakdownStrip={showBreakdownStrip}
      />
      {footerPreview === 'joined' ? (
        <RallyPersonalZoneSkeleton
          collectPreview={collectPreview}
          reserveRewardSlot={reserveRewardSlot}
          rewardSlotLoading={rewardSlotLoading}
          rewardShownInStanding={rewardShownInStanding}
          reserveTxLink={reserveTxLink}
        />
      ) : null}
      {footerPreview === 'join' ? <RallyJoinFooterSkeleton /> : null}
      {footerPreview === 'connect' ? <RallyConnectFooterSkeleton /> : null}
    </>
  );
}

export { resolveRallyHeroCardMinClass };
