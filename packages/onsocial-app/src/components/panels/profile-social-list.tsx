'use client';

import type { RefObject } from 'react';
import { Divider } from '@onsocial/ui';
import { StandingListLoadMoreFooter } from '@/components/panels/standing-list-load-more-footer';
import {
  ProfileSocialListRow,
  ProfileSocialListSkeleton,
  type ProfileSocialListSkeletonRowVariant,
  type ProfileStandingTimeMode,
} from '@/components/panels/profile-social-list-row';
import type { ProfileListAccount } from '@/lib/profile-list-account';

export function ProfileSocialList({
  accounts,
  listKey,
  viewerAccountId,
  showSolidarityBadge,
  standingTimeMode = 'always',
  skeletonRowVariant = 'standing',
  canUpdateStandingFor,
  isPendingFor,
  onUpdateStanding,
  loadMoreSentinelRef,
  footerSummary,
  isLoadingMore,
  showLoadMoreSentinel,
}: {
  accounts: ProfileListAccount[];
  listKey: string;
  viewerAccountId: string | null;
  showSolidarityBadge?: boolean;
  standingTimeMode?: ProfileStandingTimeMode;
  skeletonRowVariant?: ProfileSocialListSkeletonRowVariant;
  canUpdateStandingFor: (account: ProfileListAccount) => boolean;
  isPendingFor: (accountId: string) => boolean;
  onUpdateStanding: (
    account: ProfileListAccount,
    shouldStand: boolean
  ) => void;
  loadMoreSentinelRef: RefObject<HTMLDivElement | null>;
  footerSummary?: string | null;
  isLoadingMore: boolean;
  showLoadMoreSentinel: boolean;
}) {
  return (
    <div key={listKey} className="profile-social-list">
      <div className="standing-list">
        {accounts.map((account, index) => (
          <div key={account.accountId}>
            {index > 0 ? <Divider variant="item" /> : null}
            <ProfileSocialListRow
              account={account}
              showSolidarityBadge={showSolidarityBadge}
              standingTimeMode={standingTimeMode}
              viewerAccountId={viewerAccountId}
              canUpdateStanding={canUpdateStandingFor(account)}
              isPending={isPendingFor(account.accountId)}
              onUpdateStanding={(shouldStand) =>
                onUpdateStanding(account, shouldStand)
              }
            />
          </div>
        ))}
      </div>
      <StandingListLoadMoreFooter
        loadMoreSentinelRef={loadMoreSentinelRef}
        resultsSummary={footerSummary}
        isLoadingMore={isLoadingMore}
        showSentinel={showLoadMoreSentinel}
        skeletonRowVariant={skeletonRowVariant}
      />
    </div>
  );
}

export { ProfileSocialListSkeleton };
