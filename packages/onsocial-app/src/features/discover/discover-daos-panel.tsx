'use client';

import { ListLoadError } from '@/components/panels/list-load-error';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { DaoDirectoryList } from '@/features/protocol/dao-directory-row';
import { discoverPeopleSearchQuery } from '@/features/discover/discover-omni-search';
import { useDaoCatalogBrowse } from '@/hooks/use-dao-catalog-browse';

/**
 * Discover → DAOs — factory catalog with the same square-crest rows as Protocol.
 * Guilds can follow as a sibling tab later.
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
      <p className="daos-index-empty dao-discover-status">
        {statusLine}
        {catalogQuery ? ` · “${catalogQuery}”` : ''}
      </p>

      {error ? <ListLoadError message={error} onRetry={retry} /> : null}

      {showSkeleton ? (
        <p className="daos-index-empty">Loading catalog…</p>
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
