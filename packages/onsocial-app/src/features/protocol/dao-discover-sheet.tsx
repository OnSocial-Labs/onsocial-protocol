'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SearchField } from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { DaoDirectoryList } from '@/features/protocol/dao-directory-row';
import { daoDirectoryEntryFromCatalog } from '@/features/protocol/dao-directory';
import {
  fetchDaoCatalog,
  type DaoCatalogEntry,
} from '@/features/protocol/dao-catalog-client';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';

const DISCOVER_PAGE_SIZE = 24;
const DISCOVER_SOFT_POLL_MS = 2800;
const DISCOVER_Z = 72;

/**
 * Full-factory Discover slide-over — Standing-style square-crest list.
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
  const [rows, setRows] = useState<DaoCatalogEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [factoryCount, setFactoryCount] = useState(0);
  const [indexedCount, setIndexedCount] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  const requestClose = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const handleClosed = useCallback(() => {
    setDraft('');
    setQuery('');
    setRows(null);
    setOffset(0);
    setError(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = draft.trim();
      if (next === query) return;
      setPending(true);
      setError(null);
      setOffset(0);
      setRows(null);
      setQuery(next);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [draft, query]);

  useEffect(() => {
    if (!sheetOpen) return;
    let cancelled = false;
    const requestId = ++requestIdRef.current;
    queueMicrotask(() => {
      if (!cancelled) setPending(true);
    });

    void fetchDaoCatalog({
      q: query,
      limit: DISCOVER_PAGE_SIZE,
      offset,
    })
      .then((response) => {
        if (cancelled || requestId !== requestIdRef.current) return;
        setPending(false);
        setError(null);
        setRows((prev) =>
          offset > 0 && prev ? [...prev, ...response.daos] : response.daos
        );
        setTotal(response.total);
        setSyncing(response.syncing);
        setFactoryCount(response.factoryCount);
        setIndexedCount(response.indexedCount);
      })
      .catch((cause) => {
        if (cancelled || requestId !== requestIdRef.current) return;
        setPending(false);
        setError(
          cause instanceof Error ? cause.message : 'Could not load catalog.'
        );
        if (offset === 0) setRows([]);
      });

    return () => {
      cancelled = true;
    };
  }, [offset, query, sheetOpen]);

  useEffect(() => {
    if (!sheetOpen || !syncing) return;
    let cancelled = false;
    const loaded = Math.max(DISCOVER_PAGE_SIZE, offset + DISCOVER_PAGE_SIZE);
    const timer = window.setInterval(() => {
      void fetchDaoCatalog({
        q: query,
        limit: loaded,
        offset: 0,
      })
        .then((response) => {
          if (cancelled) return;
          setRows(response.daos);
          setTotal(response.total);
          setSyncing(response.syncing);
          setFactoryCount(response.factoryCount);
          setIndexedCount(response.indexedCount);
        })
        .catch(() => {
          // soft poll best-effort
        });
    }, DISCOVER_SOFT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [offset, query, sheetOpen, syncing]);

  const entries = useMemo(
    () => (rows ? rows.map(daoDirectoryEntryFromCatalog) : []),
    [rows]
  );

  const hasMore = rows != null && rows.length < total;
  const loadMore = useCallback(() => {
    if (pending || !hasMore) return;
    setPending(true);
    setOffset((prev) => prev + DISCOVER_PAGE_SIZE);
  }, [hasMore, pending]);

  useInfiniteScrollSentinel({
    sentinelRef: loadMoreRef,
    enabled: sheetOpen && hasMore && !pending,
    onIntersect: loadMore,
  });

  const statusLine = syncing
    ? `Indexing factory catalog… ${indexedCount.toLocaleString()} indexed`
    : `${total.toLocaleString()} DAOs${
        factoryCount > 0 ? ` · factory ${factoryCount.toLocaleString()}` : ''
      }`;

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
