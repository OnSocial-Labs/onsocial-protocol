'use client';

import { ListLoadError } from '@/components/panels/list-load-error';
import { ProfileSocialList } from '@/components/panels/profile-social-list';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { DiscoverFocusListPanel } from '@/features/discover/discover-focus-list-panel';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { DiscoverTabBar } from '@/features/discover/discover-tab-bar';

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
    tab,
    setTab,
    topicFilterPrefix,
    showListSkeleton,
    isListRefreshing,
    isLoadingMore,
    relationshipSynced,
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
      <DiscoverTabBar tab={tab} onTabChange={setTab} />

      {tab === 'people' ? (
        <>
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
            id="discover-panel-people"
            role="tabpanel"
            aria-labelledby="discover-tab-people"
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
                viewerRelationshipsLoading={
                  isConnected &&
                  Boolean(viewerAccountId) &&
                  !relationshipSynced
                }
                canUpdateStandingFor={(account) =>
                  isConnected &&
                  Boolean(viewerAccountId) &&
                  viewerAccountId !== account.accountId
                }
                isPendingFor={isStandingPendingForTarget}
                onUpdateStanding={(account, shouldStand) => {
                  if (
                    !viewerAccountId ||
                    viewerAccountId === account.accountId
                  ) {
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
        </>
      ) : null}

      {tab === 'topics' ? (
        <DiscoverFocusListPanel
          kind="hashtag"
          filterPrefix={topicFilterPrefix}
          tabId="discover-panel-topics"
        />
      ) : null}

      {tab === 'tickers' ? (
        <DiscoverFocusListPanel
          kind="ticker"
          filterPrefix={topicFilterPrefix}
          tabId="discover-panel-tickers"
        />
      ) : null}
    </div>
  );
}
