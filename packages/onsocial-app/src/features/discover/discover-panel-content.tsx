'use client';

import { ListLoadError } from '@/components/panels/list-load-error';
import { ProfileSocialList } from '@/components/panels/profile-social-list';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';

export function DiscoverPanelContent() {
  const {
    listAccounts,
    viewerAccountId,
    isConnected,
    connect,
    showConnectHint,
    loadError,
    actionError,
    emptyState,
    isSearchEmpty,
    showListSkeleton,
    isListRefreshing,
    isLoadingMore,
    showLoadMoreSentinel,
    loadMoreRef,
    footerSummary,
    listKey,
    clearSearch,
    retryLoad,
    isStandingPendingForTarget,
    handleUpdateStanding,
  } = useDiscoverPanel();

  return (
    <div className="standing-panel discover-panel">
      {showConnectHint ? (
        <p className="discover-connect-hint">
          <button
            type="button"
            className="discover-connect-hint-action"
            onClick={() => void connect()}
          >
            Connect wallet
          </button>{' '}
          to stand with profiles.
        </p>
      ) : null}

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
          <ProfileSocialListSkeleton rowVariant="discover" />
        ) : listAccounts.length === 0 ? (
          <div
            className={`standing-panel-empty-block${
              isSearchEmpty ? ' is-search' : ''
            }`}
          >
            <div className="standing-panel-empty-state">
              <p className="standing-panel-empty-primary">
                {emptyState.primary}
              </p>
              {emptyState.secondary ? (
                <p className="standing-panel-empty-secondary">
                  {emptyState.secondary}
                </p>
              ) : null}
              {emptyState.showClearSearch ? (
                <div className="standing-panel-empty-actions">
                  <button
                    type="button"
                    className="standing-panel-empty-action"
                    onClick={clearSearch}
                  >
                    Clear search
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <ProfileSocialList
            accounts={listAccounts}
            listKey={listKey}
            viewerAccountId={viewerAccountId}
            showSolidarityBadge
            standingTimeMode="viewer-only"
            skeletonRowVariant="discover"
            canUpdateStandingFor={(account) =>
              isConnected &&
              Boolean(viewerAccountId) &&
              viewerAccountId !== account.accountId
            }
            isPendingFor={isStandingPendingForTarget}
            onUpdateStanding={(account, shouldStand) => {
              if (!viewerAccountId || viewerAccountId === account.accountId) {
                return;
              }
              void handleUpdateStanding(account, shouldStand);
            }}
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
