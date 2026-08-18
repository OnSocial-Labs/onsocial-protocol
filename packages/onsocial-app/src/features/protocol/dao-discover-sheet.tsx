'use client';

import { useCallback } from 'react';
import { useEffect, useState } from 'react';
import { SearchField } from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { DaoDirectoryList } from '@/features/protocol/dao-directory-row';
import { useDaoCatalogBrowse } from '@/hooks/use-dao-catalog-browse';

const DISCOVER_Z = 72;

/**
 * Full-factory Discover slide-over — Standing-style square-crest list.
 * Prefer Discover → DAOs (`/discover?tab=daos`) for the primary browse path.
 */
export function DaoDiscoverSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(open);
  if (open && !sheetOpen) setSheetOpen(true);

  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = draft.trim();
      if (next === query) return;
      setQuery(next);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [draft, query]);

  const {
    entries,
    rows,
    pending,
    error,
    statusLine,
    hasMore,
    loadMore,
    loadMoreRef,
  } = useDaoCatalogBrowse({
    enabled: sheetOpen,
    query,
    debounceMs: 0,
  });

  const requestClose = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const handleClosed = useCallback(() => {
    setDraft('');
    setQuery('');
    onClose();
  }, [onClose]);

  return (
    <OsSlideOverScreen
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      title="Discover"
      subtitle="Every Sputnik factory DAO on this network"
      zIndex={DISCOVER_Z}
      contentClassName="dao-discover-sheet"
    >
      <SearchField
        value={draft}
        onValueChange={setDraft}
        placeholder="Search account or name"
        ariaLabel="Search Sputnik DAOs"
        clearAriaLabel="Clear DAO search"
        chrome="sheet"
      />

      <p className="daos-index-empty dao-discover-status">
        {statusLine}
        {query ? ` · “${query}”` : ''}
      </p>

      {error ? <p className="daos-index-empty">{error}</p> : null}

      {rows == null && pending ? (
        <p className="daos-index-empty">Loading catalog…</p>
      ) : (
        <DaoDirectoryList
          entries={entries}
          empty={
            error
              ? null
              : 'No DAOs match yet. Try a full account id — unknown DAOs resolve live when get_config succeeds.'
          }
        />
      )}

      {hasMore || pending ? (
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
    </OsSlideOverScreen>
  );
}
