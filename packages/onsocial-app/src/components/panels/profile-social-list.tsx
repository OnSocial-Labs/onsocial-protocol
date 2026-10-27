'use client';

import { useMemo, useRef, type RefObject } from 'react';
import { Divider } from '@onsocial/ui';
import { StandingListLoadMoreFooter } from '@/components/panels/standing-list-load-more-footer';
import {
  ProfileSocialListRow,
  ProfileSocialListSkeleton,
  type ProfileSocialListSkeletonRowVariant,
  type ProfileStandingTimeMode,
} from '@/components/panels/profile-social-list-row';
import { useFeedWindow } from '@/features/home/use-feed-window';
import { STANDING_ANCHOR_QUERY } from '@/features/home/home-feed-scroll-anchor';
import type { ProfileListAccount } from '@/lib/profile-list-account';

export function ProfileSocialList({
  accounts,
  listKey,
  viewerAccountId,
  showSolidarityBadge,
  standingTimeMode = 'always',
  skeletonRowVariant = 'standing',
  viewerRelationshipsLoading = false,
  canUpdateStandingFor,
  isPendingFor,
  onUpdateStanding,
  loadMoreSentinelRef,
  footerSummary,
  isLoadingMore,
  showLoadMoreSentinel,
  directoryLine,
}: {
  accounts: ProfileListAccount[];
  listKey: string;
  viewerAccountId: string | null;
  showSolidarityBadge?: boolean;
  standingTimeMode?: ProfileStandingTimeMode;
  skeletonRowVariant?: ProfileSocialListSkeletonRowVariant;
  viewerRelationshipsLoading?: boolean;
  canUpdateStandingFor: (account: ProfileListAccount) => boolean;
  isPendingFor: (accountId: string) => boolean;
  onUpdateStanding: (account: ProfileListAccount, shouldStand: boolean) => void;
  loadMoreSentinelRef: RefObject<HTMLDivElement | null>;
  footerSummary?: string | null;
  isLoadingMore: boolean;
  showLoadMoreSentinel: boolean;
  /** Offers and Hiring replace the bio with the offer or role. */
  directoryLine?: 'offers' | 'hiring';
}) {
  /*
   * List windowing — same core as the feed, thread panels, inbox, and DM
   * threads: past the row threshold, far rows collapse into spacers so a
   * long directory or standing list stops paying DOM cost offscreen. The
   * load-more sentinel sits below the list, so it still fires as the
   * bottom spacer shrinks near the tail. Rows are short standing rows
   * (~76px estimate); the measured cache corrects it after first paint.
   */
  const rowKeys = useMemo(
    () => accounts.map((account) => account.accountId),
    [accounts]
  );
  const listRef = useRef<HTMLDivElement | null>(null);
  const { windowed, start, end, topSpacer, bottomSpacer, registerRow } =
    useFeedWindow({
      keys: rowKeys,
      hostRef: listRef,
      anchorQuery: STANDING_ANCHOR_QUERY,
      estimate: 76,
    });

  return (
    <div key={listKey} className="profile-social-list">
      <div className="standing-list" ref={listRef}>
        {windowed && topSpacer > 0 ? (
          <div
            style={{ height: topSpacer }}
            aria-hidden="true"
            data-feed-window-spacer="top"
          />
        ) : null}
        {accounts.slice(start, end).map((account, sliceIndex) => {
          const index = start + sliceIndex;
          return (
            <div
              key={account.accountId}
              ref={registerRow(account.accountId)}
              data-standing-key={account.accountId}
            >
              {index > 0 ? <Divider variant="item" /> : null}
              <ProfileSocialListRow
                account={account}
                showSolidarityBadge={showSolidarityBadge}
                standingTimeMode={standingTimeMode}
                viewerAccountId={viewerAccountId}
                canUpdateStanding={canUpdateStandingFor(account)}
                isPending={isPendingFor(account.accountId)}
                viewerRelationshipLoading={viewerRelationshipsLoading}
                onUpdateStanding={(shouldStand) =>
                  onUpdateStanding(account, shouldStand)
                }
                directoryLine={directoryLine}
              />
            </div>
          );
        })}
        {windowed && bottomSpacer > 0 ? (
          <div
            style={{ height: bottomSpacer }}
            aria-hidden="true"
            data-feed-window-spacer="bottom"
          />
        ) : null}
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
