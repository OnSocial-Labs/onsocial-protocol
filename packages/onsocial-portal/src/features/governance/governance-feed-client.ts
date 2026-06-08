import { buildGovernanceApplicationsFromDaoProposals } from '@/features/governance/governance-bootstrap';
import { mergeGovernanceFeedApplications } from '@/features/governance/page-utils';
import type {
  Application,
  GovernanceDaoPolicy,
  GovernanceDaoProposal,
} from '@/features/governance/types';

export type GovernanceFeedResponse = {
  applications: Application[];
  daoPolicy: GovernanceDaoPolicy | null;
};

const FRESH_MS = 30_000;
const STALE_MS = 5 * 60_000;
const SESSION_STORAGE_KEY = 'onsocial:governance-feed:v1';

type CacheEntry = {
  data: GovernanceFeedResponse;
  fetchedAt: number;
  revalidatePromise?: Promise<GovernanceFeedResponse>;
};

const memoryCache = new Map<string, CacheEntry>();
const FEED_CACHE_KEY = 'all';

function readSessionFeedCache(): CacheEntry | null {
  if (typeof sessionStorage === 'undefined') return null;

  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CacheEntry;
    if (
      !parsed?.data?.applications ||
      !Array.isArray(parsed.data.applications)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeSessionFeedCache(entry: CacheEntry): void {
  if (typeof sessionStorage === 'undefined') return;

  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore quota or serialization failures.
  }
}

function readCachedFeed(): CacheEntry | null {
  const memoryEntry = memoryCache.get(FEED_CACHE_KEY);
  if (memoryEntry) return memoryEntry;
  return readSessionFeedCache();
}

function writeCachedFeed(data: GovernanceFeedResponse): void {
  const entry: CacheEntry = { data, fetchedAt: Date.now() };
  memoryCache.set(FEED_CACHE_KEY, entry);
  writeSessionFeedCache(entry);
}

async function readJsonResponse<T>(res: Response): Promise<T> {
  const raw = await res.text();
  if (!raw.trim()) {
    throw new Error('Empty response body');
  }

  return JSON.parse(raw) as T;
}

async function fetchGovernanceFeedFresh(): Promise<GovernanceFeedResponse> {
  const res = await fetch('/api/governance', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch governance feed');

  const data = await readJsonResponse<{
    success: boolean;
    applications: Application[];
    daoPolicy?: GovernanceDaoPolicy | null;
  }>(res);

  return {
    applications: data.applications,
    daoPolicy: data.daoPolicy ?? null,
  };
}

export function readGovernanceFeedCache(): GovernanceFeedResponse | null {
  const cached = readCachedFeed();
  if (!cached) return null;

  const age = Date.now() - cached.fetchedAt;
  if (age >= STALE_MS) return null;

  return cached.data;
}

export async function fetchGovernanceFeedBootstrap(
  limit = 20
): Promise<GovernanceFeedResponse | null> {
  try {
    const search = new URLSearchParams({ limit: String(limit) });
    const response = await fetch(
      `/api/governance/dao/recent?${search.toString()}`,
      { cache: 'no-store' }
    );
    const body = (await response.json().catch(() => null)) as {
      proposals?: GovernanceDaoProposal[] | null;
      daoPolicy?: GovernanceDaoPolicy | null;
    } | null;

    if (!response.ok || !body?.daoPolicy) {
      return null;
    }

    const applications = buildGovernanceApplicationsFromDaoProposals(
      body.proposals ?? []
    );
    if (applications.length === 0) {
      return null;
    }

    return {
      applications,
      daoPolicy: body.daoPolicy,
    };
  } catch {
    return null;
  }
}

export function applyGovernanceFeedApplications(
  bootstrapApps: Application[],
  feedApps: Application[]
): Application[] {
  if (feedApps.length === 0) {
    return bootstrapApps;
  }

  return mergeGovernanceFeedApplications(bootstrapApps, feedApps);
}

export async function fetchGovernanceFeedCached(options?: {
  onRevalidate?: (data: GovernanceFeedResponse) => void;
  skipMemoryCache?: boolean;
}): Promise<GovernanceFeedResponse> {
  const now = Date.now();

  if (!options?.skipMemoryCache) {
    const cached = readCachedFeed();
    if (cached) {
      const age = now - cached.fetchedAt;
      if (age < FRESH_MS) {
        return cached.data;
      }

      if (age < STALE_MS) {
        if (!cached.revalidatePromise) {
          cached.revalidatePromise = fetchGovernanceFeedFresh()
            .then((data) => {
              writeCachedFeed(data);
              options?.onRevalidate?.(data);
              return data;
            })
            .finally(() => {
              const entry = memoryCache.get(FEED_CACHE_KEY) ?? cached;
              entry.revalidatePromise = undefined;
              memoryCache.set(FEED_CACHE_KEY, entry);
            });
        }

        return cached.data;
      }
    }
  }

  const data = await fetchGovernanceFeedFresh();
  writeCachedFeed(data);
  return data;
}
