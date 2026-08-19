'use client';

import Link from 'next/link';
import { ListLoadError } from '@/components/panels/list-load-error';
import { DiscoverCommunityHandoff } from '@/features/discover/discover-community-handoff';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { DaoDirectoryList } from '@/features/protocol/dao-directory-row';
import { discoverPeopleSearchQuery } from '@/features/discover/discover-omni-search';
import { useDaoCatalogBrowse } from '@/hooks/use-dao-catalog-browse';
import { APP_DAOS_PATH, daosCreateHref } from '@/lib/app-routes';

/**
 * Discover → DAOs — factory catalog find. Create / My DAOs live in the DAOs app.
 */
export function DiscoverDaosPanel() {
  const { query, clearSearch } = useDiscoverPanel();
  const catalogQuery = discoverPeopleSearchQuery(query);
  const {
    entries,
    rows,
    pending,
    error,
    statusLine,
    hasMore,
    loadMore,
    loadMoreRef,
    retry,
  } = useDaoCatalogBrowse({
    enabled: true,
    query: catalogQuery,
  });

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
      <div className="discover-community-toolbar">
        <p className="launcher-home-empty dao-discover-status">
          {statusLine}
          {catalogQuery ? ` · “${catalogQuery}”` : ' · OnSocial first, then Near'}
        </p>
        <DiscoverCommunityHandoff
          links={[
            { href: APP_DAOS_PATH, label: 'My DAOs' },
            { href: daosCreateHref(), label: 'Create' },
          ]}
        />
      </div>

      {error ? <ListLoadError message={error} onRetry={retry} /> : null}

      {showSkeleton ? (
        <p className="launcher-home-empty">Loading catalog…</p>
      ) : (
        <DaoDirectoryList
          entries={entries}
          empty={
            error
              ? null
              : isSearchEmpty
                ? 'No DAOs match. Try a full account id — unknown DAOs resolve live when get_config succeeds.'
                : 'No DAOs listed yet.'
          }
        />
      )}

      {isSearchEmpty ? (
        <div className="standing-panel-empty-actions">
          <button
            type="button"
            className="standing-panel-empty-action"
            onClick={clearSearch}
          >
            Clear search
          </button>
          <Link
            className="standing-panel-empty-action"
            href={APP_DAOS_PATH}
            scroll={false}
          >
            My DAOs
          </Link>
        </div>
      ) : null}

      {hasMore || (pending && rows != null) ? (
        <div className="dao-discover-load-more">
          <div ref={loadMoreRef} className="protocol-feed-sentinel" aria-hidden />
          <button
            type="button"
            className="daos-discover-more"
            disabled={pending}
            onClick={loadMore}
          >
            {pending ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
