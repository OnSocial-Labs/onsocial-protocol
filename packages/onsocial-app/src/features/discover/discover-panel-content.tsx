'use client';

import { useCallback, useMemo, useState } from 'react';
import { OsChromeListAlert } from '@/components/chrome/os-chrome-whisper';
import { ListLoadError } from '@/components/panels/list-load-error';
import { ProfileSocialList } from '@/components/panels/profile-social-list';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { OsAppChromePage } from '@onsocial/ui';
import { DiscoverDaosPanel } from '@/features/discover/discover-daos-panel';
import { DiscoverGuildsPanel } from '@/features/discover/discover-guilds-panel';
import { DiscoverHubsPanel } from '@/features/discover/discover-hubs-panel';
import { DiscoverFocusListPanel } from '@/features/discover/discover-focus-list-panel';
import { DiscoverTabLead } from '@/features/discover/discover-tab-lead';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { DiscoverRecommendedPeek } from '@/features/discover/discover-recommended-peek';
import { DiscoverTrendingPanel } from '@/features/discover/discover-trending-panel';
import { DiscoverFaceFilterRail } from '@/features/discover/discover-face-filter-rail';
import type { DiscoverTab } from '@/features/discover/discover-tabs';
import { excludeRecommendedFromList } from '@/lib/discover-recommended';
import {
  DISCOVER_CONNECT_HINT,
  discoverProfilesLead,
} from '@/lib/discover-tab-lead';
import { OsEmptyAction } from '@/lib/os-empty-action';
import { resolveAppLoadingPresentation } from '@/lib/app-loading-contract';

export function DiscoverPanelContent() {
  const [recommendedShownIds, setRecommendedShownIds] = useState<string[]>([]);
  const handleRecommendedShownIds = useCallback((ids: string[]) => {
    setRecommendedShownIds((prev) => {
      if (
        prev.length === ids.length &&
        prev.every((id, index) => id === ids[index])
      ) {
        return prev;
      }
      return ids;
    });
  }, []);
  const {
    listAccounts,
    viewerAccountId,
    isConnected,
    showConnectHint,
    loadError,
    actionError,
    emptyState,
    isSearchEmpty,
    searchSettled,
    tab,
    setTab,
    topicFilterPrefix,
    query,
    face,
    industry,
    craft,
    discoverableTotal,
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
    initialTrending,
  } = useDiscoverPanel();
  const [visitedTabs, setVisitedTabs] = useState(
    () => new Set<DiscoverTab>([tab])
  );
  if (!visitedTabs.has(tab)) {
    setVisitedTabs(new Set([...visitedTabs, tab]));
  }
  const profilesForList = useMemo(
    () => excludeRecommendedFromList(listAccounts, recommendedShownIds),
    [listAccounts, recommendedShownIds]
  );
  const hasPaintedRows = profilesForList.length > 0;
  const loadingPresentation = isLoadingMore
    ? resolveAppLoadingPresentation('appending', { hasPaintedRows })
    : showListSkeleton
      ? resolveAppLoadingPresentation('cold', { hasPaintedRows })
      : isListRefreshing
        ? resolveAppLoadingPresentation('refreshing', { hasPaintedRows })
        : null;
  const errorPresentation = loadError
    ? resolveAppLoadingPresentation('error', { hasPaintedRows })
    : null;
  const showProfilesSkeleton = loadingPresentation === 'skeleton';
  const showListRefreshing = loadingPresentation === 'preserve';
  const showAppendSkeleton = loadingPresentation === 'append-skeleton';
  const hasRecommended = recommendedShownIds.length > 0;
  return (
    <OsAppChromePage className="discover-panel">
      {visitedTabs.has('trending') ? (
        <div hidden={tab !== 'trending'}>
          <DiscoverTrendingPanel onOpenTab={setTab} initial={initialTrending} />
        </div>
      ) : null}

      {visitedTabs.has('profiles') ? (
        <div hidden={tab !== 'profiles'}>
          <DiscoverTabLead>
            {discoverProfilesLead(
              discoverableTotal,
              query,
              face,
              industry,
              craft
            )}
          </DiscoverTabLead>
          <DiscoverFaceFilterRail />

          {showConnectHint ? (
            <div className="os-chrome-whisper-anchor" role="status">
              <p className="discover-connect-hint os-chrome-whisper">
                {DISCOVER_CONNECT_HINT}
              </p>
            </div>
          ) : null}

          {loadError ? (
            errorPresentation === 'overlay' ? (
              <OsChromeListAlert message={loadError} onRetry={retryLoad} />
            ) : (
              <ListLoadError message={loadError} onRetry={retryLoad} />
            )
          ) : null}

          {actionError ? <OsChromeListAlert message={actionError} /> : null}

          <div
            id="discover-panel-profiles"
            role="tabpanel"
            aria-labelledby="discover-tab-profiles"
            className={`standing-panel-body${
              showListRefreshing ? ' is-refreshing' : ''
            }`}
          >
            <DiscoverRecommendedPeek
              onShownIdsChange={handleRecommendedShownIds}
            />

            <div className="discover-profiles-list-slot">
              {showProfilesSkeleton ? (
                <ProfileSocialListSkeleton rowVariant="discover" />
              ) : profilesForList.length === 0 ? (
                !hasRecommended && (!isSearchEmpty || searchSettled) ? (
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
                          <OsEmptyAction onClick={clearSearch}>
                            Clear search
                          </OsEmptyAction>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null
              ) : (
                <ProfileSocialList
                  accounts={profilesForList}
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
                  isLoadingMore={showAppendSkeleton}
                  showLoadMoreSentinel={showLoadMoreSentinel}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {visitedTabs.has('daos') ? (
        <div hidden={tab !== 'daos'}>
          <DiscoverDaosPanel />
        </div>
      ) : null}

      {visitedTabs.has('guilds') ? (
        <div hidden={tab !== 'guilds'}>
          <DiscoverGuildsPanel />
        </div>
      ) : null}

      {visitedTabs.has('hubs') ? (
        <div hidden={tab !== 'hubs'}>
          <DiscoverHubsPanel />
        </div>
      ) : null}

      {visitedTabs.has('topics') ? (
        <div hidden={tab !== 'topics'}>
          <DiscoverFocusListPanel
            kind="hashtag"
            filterPrefix={topicFilterPrefix}
            tabId="discover-panel-topics"
            initialRows={initialTrending?.topics ?? null}
          />
        </div>
      ) : null}

      {visitedTabs.has('tickers') ? (
        <div hidden={tab !== 'tickers'}>
          <DiscoverFocusListPanel
            kind="ticker"
            filterPrefix={topicFilterPrefix}
            tabId="discover-panel-tickers"
            initialRows={initialTrending?.tickers ?? null}
          />
        </div>
      ) : null}
    </OsAppChromePage>
  );
}
