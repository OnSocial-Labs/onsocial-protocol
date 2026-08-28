'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { daoDirectoryEntryFromCatalog } from '@/features/protocol/dao-directory';
import {
  fetchDaoCatalog,
  type DaoCatalogEntry,
} from '@/features/protocol/dao-catalog-client';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import { discoverDaosLead } from '@/lib/discover-tab-lead';

const PAGE_SIZE = 24;
const SOFT_POLL_MS = 2800;

/**
 * Paginated Sputnik factory catalog browse — shared by Discover DAOs tab and
 * the Protocol DAOs Discover slide-over.
 */
export function useDaoCatalogBrowse(opts: {
  enabled: boolean;
  /** Live search string (account id or name); debounced inside the hook. */
  query: string;
  debounceMs?: number;
}) {
  const { enabled, query, debounceMs = 220 } = opts;
  const [activeQuery, setActiveQuery] = useState(query);
  const [rows, setRows] = useState<DaoCatalogEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [factoryCount, setFactoryCount] = useState(0);
  const [indexedCount, setIndexedCount] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  // Debounce search into activeQuery. Skip when unchanged — otherwise clearing
  // rows after a fast first fetch leaves "5,309 DAOs" with an empty list.
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      if (query === activeQuery) return;
      setActiveQuery(query);
      setOffset(0);
      setRows(null);
      setError(null);
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [activeQuery, debounceMs, enabled, query]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const requestId = ++requestIdRef.current;
    queueMicrotask(() => {
      if (!cancelled) setPending(true);
    });

    void fetchDaoCatalog({
      q: activeQuery,
      limit: PAGE_SIZE,
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
  }, [activeQuery, enabled, offset, reloadNonce]);

  useEffect(() => {
    if (!enabled || !syncing) return;
    let cancelled = false;
    const loaded = Math.max(PAGE_SIZE, offset + PAGE_SIZE);
    const timer = window.setInterval(() => {
      void fetchDaoCatalog({
        q: activeQuery,
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
    }, SOFT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeQuery, enabled, offset, syncing]);

  const entries = useMemo(
    () => (rows ? rows.map(daoDirectoryEntryFromCatalog) : []),
    [rows]
  );

  const hasMore = rows != null && rows.length < total;
  const loadMore = useCallback(() => {
    if (pending || !hasMore) return;
    setPending(true);
    setOffset((prev) => prev + PAGE_SIZE);
  }, [hasMore, pending]);

  useInfiniteScrollSentinel({
    sentinelRef: loadMoreRef,
    enabled: enabled && hasMore && !pending,
    onIntersect: loadMore,
  });

  const statusLine = discoverDaosLead(total, activeQuery, syncing);

  const retry = useCallback(() => {
    setError(null);
    setOffset(0);
    setRows(null);
    setPending(true);
    setReloadNonce((n) => n + 1);
  }, []);

  return {
    entries,
    rows,
    total,
    pending,
    error,
    syncing,
    statusLine,
    hasMore,
    loadMore,
    loadMoreRef,
    retry,
    activeQuery,
  };
}
