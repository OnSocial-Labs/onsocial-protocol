import {
  isProfileSearchQuery,
  normalizeProfileSearchQuery,
} from '@/lib/profile-account-search';
import type {
  NetworkFilterKind,
  NetworkOrbitPayload,
  NetworkOrbitSearchMeta,
  NetworkStandingCounts,
} from '@/lib/profile-network';

export type NetworkOrbitResult = {
  accounts: NetworkOrbitPayload['accounts'];
  counts: NetworkStandingCounts;
  centerMood: NetworkOrbitPayload['centerMood'] | null;
  search: NetworkOrbitSearchMeta | null;
};

const FRESH_MS = 45_000;
const STALE_MS = 5 * 60_000;

type CacheEntry = {
  data: NetworkOrbitResult;
  fetchedAt: number;
  revalidatePromise?: Promise<NetworkOrbitResult>;
};

const memoryCache = new Map<string, CacheEntry>();

function isAbortLike(error: unknown, signal?: AbortSignal | null): boolean {
  if (signal?.aborted) return true;
  return (
    (error instanceof DOMException || error instanceof Error) &&
    error.name === 'AbortError'
  );
}

function buildRequestKey(options: {
  accountId: string;
  viewerAccountId: string | null;
  searchQuery?: string;
  filter?: NetworkFilterKind;
}): string {
  return [
    options.accountId,
    options.viewerAccountId ?? '',
    options.filter ?? 'all',
    normalizeProfileSearchQuery(options.searchQuery),
  ].join('|');
}

function buildRequestUrl(options: {
  accountId: string;
  viewerAccountId: string | null;
  searchQuery?: string;
  filter?: NetworkFilterKind;
}): string {
  const search = new URLSearchParams({ accountId: options.accountId });
  if (options.viewerAccountId) {
    search.set('viewerAccountId', options.viewerAccountId);
  }
  const normalizedQuery = normalizeProfileSearchQuery(options.searchQuery);
  if (isProfileSearchQuery(normalizedQuery)) {
    search.set('q', normalizedQuery);
  }
  if (options.filter && options.filter !== 'all') {
    search.set('filter', options.filter);
  }
  return `/api/profile/network?${search.toString()}`;
}

async function fetchNetworkOrbitFresh(
  options: {
    accountId: string;
    viewerAccountId: string | null;
    searchQuery?: string;
    filter?: NetworkFilterKind;
  },
  signal?: AbortSignal
): Promise<NetworkOrbitResult> {
  const res = await fetch(buildRequestUrl(options), {
    cache: 'no-store',
    signal,
  });
  if (!res.ok) {
    throw new Error('Network orbit request failed');
  }

  const body = (await res.json()) as Partial<NetworkOrbitPayload>;
  return {
    accounts: body.accounts ?? [],
    counts: {
      incoming: Number(body.counts?.incoming ?? 0),
      outgoing: Number(body.counts?.outgoing ?? 0),
      mutual: Number(body.counts?.mutual ?? 0),
    },
    centerMood: body.centerMood ?? null,
    search: body.search ?? null,
  };
}

/**
 * In-memory stale-while-revalidate for repeat orbit/search requests
 * in-session. The server route is the source of truth on first load.
 */
export async function fetchNetworkOrbit(
  options: {
    accountId: string;
    viewerAccountId: string | null;
    searchQuery?: string;
    filter?: NetworkFilterKind;
  },
  fetchOptions?: {
    signal?: AbortSignal;
    onRevalidate?: (result: NetworkOrbitResult) => void;
    skipMemoryCache?: boolean;
  }
): Promise<NetworkOrbitResult> {
  const key = buildRequestKey(options);
  const now = Date.now();

  if (!fetchOptions?.skipMemoryCache) {
    const cached = memoryCache.get(key);
    if (cached) {
      const age = now - cached.fetchedAt;
      if (age < FRESH_MS) {
        return cached.data;
      }
      if (age < STALE_MS) {
        if (!cached.revalidatePromise) {
          cached.revalidatePromise = fetchNetworkOrbitFresh(options)
            .then((data) => {
              memoryCache.set(key, { data, fetchedAt: Date.now() });
              fetchOptions?.onRevalidate?.(data);
              return data;
            })
            .catch((error) => {
              if (isAbortLike(error)) return cached.data;
              throw error;
            })
            .finally(() => {
              const entry = memoryCache.get(key);
              if (entry) entry.revalidatePromise = undefined;
            });
        }
        return cached.data;
      }
    }
  }

  const data = await fetchNetworkOrbitFresh(options, fetchOptions?.signal);
  memoryCache.set(key, { data, fetchedAt: now });
  return data;
}
