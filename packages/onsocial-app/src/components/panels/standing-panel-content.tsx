'use client';

import { useMemo } from 'react';
import { useStandingPanel } from '@/components/panels/standing-panel-context';
import { ListLoadError } from '@/components/panels/list-load-error';
import { ProfileSocialList } from '@/components/panels/profile-social-list';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { StandingDiscoverLink } from '@/components/panels/standing-discover-link';
import {
  profileListAccountToStandingSummary,
  standingAccountToProfileListAccount,
} from '@/lib/profile-list-account';

export function StandingPanelContent() {
  const {
    kind,
    shellVariant,
    query,
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
    showLoadMoreSentinel,
    loadMoreRef,
    footerSummary,
    listKey,
    retryLoad,
    handleUpdateStanding,
  } = useStandingPanel();

  const isSearchEmpty = Boolean(query.trim());
  const listAccounts = useMemo(
    () => filteredAccounts.map(standingAccountToProfileListAccount),
    [filteredAccounts]
  );

  return (
    <div className="standing-panel">
      {loadError ? (
        <ListLoadError message={loadError} onRetry={retryLoad} />
      ) : null}

      {actionError ? (
        <p className="standing-panel-error" role="alert">
          {actionError}
        </p>
      ) : null}

      <div
        className={`standing-panel-body${
          isListRefreshing && !showListSkeleton ? ' is-refreshing' : ''
        }`}
      >
        {showListSkeleton ? (
          <ProfileSocialListSkeleton />
        ) : listAccounts.length === 0 ? (
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
                    <button
                      type="button"
                      className="standing-panel-empty-action"
                      onClick={clearSearch}
                    >
                      Clear search
                    </button>
                  ) : null}
                  {emptyState.showDiscover ? (
                    <StandingDiscoverLink
                      closeOverlay={shellVariant === 'overlay'}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <ProfileSocialList
            accounts={listAccounts}
            listKey={listKey}
            viewerAccountId={viewerAccountId}
            showSolidarityBadge={kind !== 'mutual'}
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
