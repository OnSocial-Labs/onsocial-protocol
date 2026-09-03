'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ListLoadError } from '@/components/panels/list-load-error';
import { ProfileSocialList } from '@/components/panels/profile-social-list';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { OsAppChromePage, OsAppChromePageStatus } from '@onsocial/ui';
import { DiscoverDaosPanel } from '@/features/discover/discover-daos-panel';
import { DiscoverGuildsPanel } from '@/features/discover/discover-guilds-panel';
import { DiscoverHubsPanel } from '@/features/discover/discover-hubs-panel';
import { DiscoverFocusListPanel } from '@/features/discover/discover-focus-list-panel';
import { DiscoverTabLead } from '@/features/discover/discover-tab-lead';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { DiscoverRecommendedPeek } from '@/features/discover/discover-recommended-peek';
import { DiscoverTrendingPanel } from '@/features/discover/discover-trending-panel';
import { DiscoverFaceFilterRail } from '@/features/discover/discover-face-filter-rail';
import {
  excludeRecommendedFromList,
  nextDiscoverListMinHeight,
} from '@/lib/discover-recommended';
import { discoverProfilesLead } from '@/lib/discover-tab-lead';

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
  const listSlotRef = useRef<HTMLDivElement>(null);
  const [listSlotReserve, setListSlotReserve] = useState<{
    key: string;
    height: number | null;
  }>({ key: listKey, height: null });
  if (listSlotReserve.key !== listKey) {
    setListSlotReserve({ key: listKey, height: null });
  }
  const listSlotMinHeight =
    listSlotReserve.key === listKey ? listSlotReserve.height : null;
  const canExcludeRecommended =
    listSlotMinHeight != null || showListSkeleton || listAccounts.length === 0;
  const profilesForList = useMemo(
    () =>
      canExcludeRecommended
        ? excludeRecommendedFromList(listAccounts, recommendedShownIds)
        : listAccounts,
    [canExcludeRecommended, listAccounts, recommendedShownIds]
  );
  const hasRecommended = recommendedShownIds.length > 0;

  useLayoutEffect(() => {
    if (showListSkeleton) return;
    const node = listSlotRef.current;
    if (!node) return;
    const measured = node.getBoundingClientRect().height;
    setListSlotReserve((previous) => {
      const height = nextDiscoverListMinHeight(
        previous.key === listKey ? previous.height : null,
        measured
      );
      if (previous.key === listKey && previous.height === height) {
        return previous;
      }
      return { key: listKey, height };
    });
  }, [
    listAccounts,
    listKey,
    profilesForList,
    recommendedShownIds,
    showListSkeleton,
  ]);

  return (
    <OsAppChromePage className="standing-panel discover-panel">
      {tab === 'trending' ? (
        <DiscoverTrendingPanel onOpenTab={setTab} initial={initialTrending} />
      ) : null}

      {tab === 'profiles' ? (
        <>
          <DiscoverTabLead>
            {discoverProfilesLead(discoverableTotal, query, face, industry)}
          </DiscoverTabLead>
          <DiscoverFaceFilterRail />

          {showConnectHint ? (
            <OsAppChromePageStatus className="discover-connect-hint">
              Connect to stand with profiles.
            </OsAppChromePageStatus>
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
            id="discover-panel-profiles"
            role="tabpanel"
            aria-labelledby="discover-tab-profiles"
            className={`standing-panel-body${
              isListRefreshing && !showListSkeleton ? ' is-refreshing' : ''
            }`}
          >
            <DiscoverRecommendedPeek
              onShownIdsChange={handleRecommendedShownIds}
            />

            <div
              ref={listSlotRef}
              className="discover-profiles-list-slot"
              style={
                listSlotMinHeight != null
                  ? { minHeight: listSlotMinHeight }
                  : undefined
              }
            >
              {showListSkeleton ? (
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
                  isLoadingMore={isLoadingMore}
                  showLoadMoreSentinel={showLoadMoreSentinel}
                />
              )}
            </div>
          </div>
        </>
      ) : null}

      {tab === 'daos' ? <DiscoverDaosPanel /> : null}

      {tab === 'guilds' ? <DiscoverGuildsPanel /> : null}

      {tab === 'hubs' ? <DiscoverHubsPanel /> : null}

      {tab === 'topics' ? (
        <DiscoverFocusListPanel
          kind="hashtag"
          filterPrefix={topicFilterPrefix}
          tabId="discover-panel-topics"
          initialRows={initialTrending?.topics ?? null}
        />
      ) : null}

      {tab === 'tickers' ? (
        <DiscoverFocusListPanel
          kind="ticker"
          filterPrefix={topicFilterPrefix}
          tabId="discover-panel-tickers"
          initialRows={initialTrending?.tickers ?? null}
        />
      ) : null}
    </OsAppChromePage>
  );
}
