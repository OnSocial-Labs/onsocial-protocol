'use client';

import { OsChromeListAlert } from '@/components/chrome/os-chrome-whisper';
import { ListLoadError } from '@/components/panels/list-load-error';
import { DiscoverCommunityListSkeleton } from '@/features/discover/discover-loading-skeleton';
import { DiscoverTabLead } from '@/features/discover/discover-tab-lead';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { DaoDirectoryList } from '@/features/protocol/dao-directory-row';
import { discoverPeopleSearchQuery } from '@/features/discover/discover-omni-search';
import { useDaoCatalogBrowse } from '@/hooks/use-dao-catalog-browse';
import { APP_DAOS_PATH, daosCreateHref } from '@/lib/app-routes';
import { useTranslations } from 'next-intl';
import { OsEmptyAction } from '@/lib/os-empty-action';

/**
 * Discover → DAOs — factory catalog find. Create / My DAOs live in the DAOs app.
 */
export function DiscoverDaosPanel() {
  const { query, scrollRootRef } = useDiscoverPanel();
  const catalogQuery = discoverPeopleSearchQuery(query);
  const {
    entries,
    rows,
    pending,
    error,
    hasMore,
    loadMoreRef,
    retry,
    statusLine,
  } = useDaoCatalogBrowse({
    enabled: true,
    query: catalogQuery,
    scrollRootRef,
  });

  const t = useTranslations('shell');
  const showSkeleton = rows == null && pending;
  const isSearchEmpty =
    catalogQuery.length > 0 && entries.length === 0 && !pending && rows != null;

  return (
    <div
      id="discover-panel-daos"
      role="tabpanel"
      aria-labelledby="discover-tab-daos"
      className="standing-panel-body discover-daos-panel"
    >
      <DiscoverTabLead
        links={[
          { href: APP_DAOS_PATH, label: t('homeChrome.myDaos') },
          { href: daosCreateHref(), label: t('discover.create') },
        ]}
      >
        {statusLine}
      </DiscoverTabLead>

      {error ? (
        entries.length > 0 ? (
          <OsChromeListAlert message={error} onRetry={retry} />
        ) : (
          <ListLoadError message={error} onRetry={retry} />
        )
      ) : null}

      {showSkeleton ? (
        <DiscoverCommunityListSkeleton label={t('discover.loadingDaos')} />
      ) : entries.length > 0 ? (
        <DaoDirectoryList entries={entries} />
      ) : !error && (isSearchEmpty || catalogQuery.length === 0) ? (
        <div className="standing-panel-empty-block">
          <div className="standing-panel-empty-state">
            <p className="standing-panel-empty-primary">
              {isSearchEmpty ? t('discover.noMatches') : t('discover.noDaos')}
            </p>
          </div>
          {isSearchEmpty ? (
            <div className="standing-panel-empty-actions">
              <OsEmptyAction href={APP_DAOS_PATH}>
                {t('homeChrome.myDaos')}
              </OsEmptyAction>
            </div>
          ) : null}
        </div>
      ) : null}

      {hasMore || (pending && rows != null) ? (
        <div className="dao-discover-load-more">
          <div
            ref={loadMoreRef}
            className="protocol-feed-sentinel"
            aria-hidden
          />
          {pending && rows != null ? (
            <DiscoverCommunityListSkeleton
              label={t('discover.loadingMoreDaos')}
              count={2}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
