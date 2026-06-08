import type { PortalNetworkFilter } from '@/lib/portal-config';
import {
  isAbortLikeError,
  isProfileSearchQuery,
  normalizeProfileSearchQuery,
} from '@/lib/profile-account-search';
import type { NetworkAccount } from '@/lib/profile-network-accounts';
import type {
  PortalProfileNetworkPayload,
  PortalProfileNetworkSearchMeta,
} from '@/lib/portal-profile-network';

export type PortalProfileNetworkResult = {
  accounts: NetworkAccount[];
  counts: PortalProfileNetworkPayload['counts'];
  search: PortalProfileNetworkSearchMeta | null;
};

const FRESH_MS = 45_000;
const STALE_MS = 5 * 60_000;

type CacheEntry = {
  data: PortalProfileNetworkResult;
  fetchedAt: number;
  revalidatePromise?: Promise<PortalProfileNetworkResult>;
};

const memoryCache = new Map<string, CacheEntry>();

function buildNetworkRequestKey(options: {
  accountId: string;
  viewerAccountId: string | null;
  searchQuery?: string;
  filter?: PortalNetworkFilter;
}): string {
  const normalizedQuery = normalizeProfileSearchQuery(options.searchQuery);
  const filter = options.filter ?? 'all';
  return [
    options.accountId,
    options.viewerAccountId ?? '',
    filter,
    normalizedQuery,
  ].join('|');
}

function buildNetworkRequestUrl(options: {
  accountId: string;
  viewerAccountId: string | null;
  searchQuery?: string;
  filter?: PortalNetworkFilter;
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

async function fetchPortalProfileNetworkFresh(
  options: {
    accountId: string;
    viewerAccountId: string | null;
    searchQuery?: string;
    filter?: PortalNetworkFilter;
  },
  signal?: AbortSignal
): Promise<PortalProfileNetworkResult> {
  const normalizedQuery = normalizeProfileSearchQuery(options.searchQuery);
  const isSearch = isProfileSearchQuery(normalizedQuery);

  const res = await fetch(buildNetworkRequestUrl(options), {
    cache: isSearch ? 'no-store' : 'default',
    signal,
  });
  if (!res.ok) {
    throw new Error('Network request failed');
  }

  const body = (await res.json()) as Partial<PortalProfileNetworkPayload>;

  return {
    accounts: body.accounts ?? [],
    counts: {
      incoming: Number(body.counts?.incoming ?? 0),
      outgoing: Number(body.counts?.outgoing ?? 0),
      mutual: Number(body.counts?.mutual ?? 0),
    },
    search: body.search ?? null,
  };
}

/**
 * In-memory stale-while-revalidate for repeat network/search requests in-session.
 * HTTP cache headers on the API cover cross-navigation reuse of the default sample.
 */
export async function fetchPortalProfileNetwork(
  options: {
    accountId: string;
    viewerAccountId: string | null;
    searchQuery?: string;
    filter?: PortalNetworkFilter;
  },
  fetchOptions?: {
    signal?: AbortSignal;
    onRevalidate?: (result: PortalProfileNetworkResult) => void;
    skipMemoryCache?: boolean;
  }
): Promise<PortalProfileNetworkResult> {
  const key = buildNetworkRequestKey(options);
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
          cached.revalidatePromise = fetchPortalProfileNetworkFresh(options)
            .then((data) => {
              memoryCache.set(key, { data, fetchedAt: Date.now() });
              fetchOptions?.onRevalidate?.(data);
              return data;
            })
            .catch((error) => {
              if (isAbortLikeError(error)) return cached.data;
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

  const data = await fetchPortalProfileNetworkFresh(
    options,
    fetchOptions?.signal
  );
  memoryCache.set(key, { data, fetchedAt: now });
  return data;
}
