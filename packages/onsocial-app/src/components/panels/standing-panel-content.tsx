'use client';

import { useMemo } from 'react';
import { OsChromeListAlert } from '@/components/chrome/os-chrome-whisper';
import { ListLoadError } from '@/components/panels/list-load-error';
import { useStandingPanel } from '@/components/panels/standing-panel-context';
import { ProfileSocialList } from '@/components/panels/profile-social-list';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { StandingDiscoverLink } from '@/components/panels/standing-discover-link';
import { OsEmptyAction } from '@/lib/os-empty-action';
import { useViewerEndorsement } from '@/hooks/use-viewer-endorsement';
import {
  profileListAccountToStandingSummary,
  standingAccountToProfileListAccount,
} from '@/lib/profile-list-account';
import { getGlobalViewerEndorsementLedger } from '@/lib/viewer-endorsement-global';
import { overlayViewerEndorsedOnAccounts } from '@/lib/viewer-endorsement-ledger';

export function StandingPanelContent() {
  const {
    kind,
    query,
    searchSettled,
    viewerAccountId,
    isConnected,
    filteredAccounts,
    mergedPendingIds,
    loadError,
    actionError,
    emptyState,
    clearSearch,
    showListSkeleton,
    isListRefreshing,
    isLoadingMore,
    relationshipSynced,
    showLoadMoreSentinel,
    loadMoreRef,
    footerSummary,
    listKey,
    retryLoad,
    handleUpdateStanding,
    accountId,
  } = useStandingPanel();
  const { endorsementSyncVersion } = useViewerEndorsement(accountId);

  const isSearchEmpty = Boolean(query.trim());
  const listAccounts = useMemo(
    () =>
      overlayViewerEndorsedOnAccounts(
        filteredAccounts.map(standingAccountToProfileListAccount),
        getGlobalViewerEndorsementLedger()
      ),
    [endorsementSyncVersion, filteredAccounts]
  );
  const listHasRows = listAccounts.length > 0;

  return (
    <div className="standing-panel">
      {loadError ? (
        listHasRows ? (
          <OsChromeListAlert message={loadError} onRetry={retryLoad} />
        ) : (
          <ListLoadError message={loadError} onRetry={retryLoad} />
        )
      ) : null}

      {actionError ? (
        <OsChromeListAlert message={actionError} />
      ) : null}

      <div
        className={`standing-panel-body${
          isListRefreshing && !showListSkeleton ? ' is-refreshing' : ''
        }`}
      >
        {showListSkeleton ? (
          <ProfileSocialListSkeleton />
        ) : listAccounts.length === 0 ? (
          !query.trim() || searchSettled ? (
          <div
            className={`standing-panel-empty-block${
              isSearchEmpty ? ' is-search' : ''
            }`}
          >
            <div className="standing-panel-empty-state">
              <p className="standing-panel-empty-primary">{emptyState.primary}</p>
              {emptyState.secondary ? (
                <p className="standing-panel-empty-secondary">
                  {emptyState.secondary}
                </p>
              ) : null}
              {emptyState.showClearSearch || emptyState.showDiscover ? (
                <div className="standing-panel-empty-actions">
                  {emptyState.showClearSearch ? (
                    <OsEmptyAction onClick={clearSearch}>
                      Clear search
                    </OsEmptyAction>
                  ) : null}
                  {emptyState.showDiscover ? (
                    <StandingDiscoverLink closeOverlay />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          ) : null
        ) : (
          <ProfileSocialList
            accounts={listAccounts}
            listKey={listKey}
            viewerAccountId={viewerAccountId}
            showSolidarityBadge={kind !== 'mutual'}
            viewerRelationshipsLoading={
              isConnected && Boolean(viewerAccountId) && !relationshipSynced
            }
            canUpdateStandingFor={(account) =>
              isConnected &&
              Boolean(viewerAccountId) &&
              viewerAccountId !== account.accountId
            }
            isPendingFor={(accountId) => mergedPendingIds.has(accountId)}
            onUpdateStanding={(account, shouldStand) =>
              void handleUpdateStanding(
                profileListAccountToStandingSummary(account),
                shouldStand
              )
            }
            loadMoreSentinelRef={loadMoreRef}
            footerSummary={footerSummary}
            isLoadingMore={isLoadingMore}
            showLoadMoreSentinel={showLoadMoreSentinel}
          />
        )}
      </div>
    </div>
  );
}
