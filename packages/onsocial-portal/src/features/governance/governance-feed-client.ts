import { buildGovernanceApplicationsFromDaoProposals } from '@/features/governance/governance-bootstrap';
import { resolveGovernanceDaoAccountId } from '@/features/governance/governance-dao-board';
import { mergeGovernanceFeedApplications } from '@/features/governance/page-utils';
import type {
  Application,
  GovernanceDaoPolicy,
  GovernanceDaoProposal,
} from '@/features/governance/types';

export type GovernanceFeedResponse = {
  applications: Application[];
  daoPolicy: GovernanceDaoPolicy | null;
  daoAccountId: string;
};

const FRESH_MS = 30_000;
const STALE_MS = 5 * 60_000;
const SESSION_STORAGE_PREFIX = 'onsocial:governance-feed:v2:';

type CacheEntry = {
  data: GovernanceFeedResponse;
  fetchedAt: number;
  revalidatePromise?: Promise<GovernanceFeedResponse>;
};

const memoryCache = new Map<string, CacheEntry>();

function feedCacheKey(daoAccountId: string): string {
  return daoAccountId;
}

function readSessionFeedCache(daoAccountId: string): CacheEntry | null {
  if (typeof sessionStorage === 'undefined') return null;

  try {
    const raw = sessionStorage.getItem(
      `${SESSION_STORAGE_PREFIX}${daoAccountId}`
    );
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

function writeSessionFeedCache(daoAccountId: string, entry: CacheEntry): void {
  if (typeof sessionStorage === 'undefined') return;

  try {
    sessionStorage.setItem(
      `${SESSION_STORAGE_PREFIX}${daoAccountId}`,
      JSON.stringify(entry)
    );
  } catch {
    // Ignore quota or serialization failures.
  }
}

function readCachedFeed(daoAccountId: string): CacheEntry | null {
  const cacheKey = feedCacheKey(daoAccountId);
  const memoryEntry = memoryCache.get(cacheKey);
  if (memoryEntry) return memoryEntry;
  return readSessionFeedCache(daoAccountId);
}

function writeCachedFeed(
  daoAccountId: string,
  data: GovernanceFeedResponse
): void {
  const cacheKey = feedCacheKey(daoAccountId);
  const entry: CacheEntry = { data, fetchedAt: Date.now() };
  memoryCache.set(cacheKey, entry);
  writeSessionFeedCache(daoAccountId, entry);
}

async function readJsonResponse<T>(res: Response): Promise<T> {
  const raw = await res.text();
  if (!raw.trim()) {
    throw new Error('Empty response body');
  }

  return JSON.parse(raw) as T;
}

async function fetchGovernanceFeedFresh(
  daoAccountId: string
): Promise<GovernanceFeedResponse> {
  const search = new URLSearchParams({
    scope: 'all',
    daoAccountId,
  });
  const res = await fetch(`/api/governance?${search.toString()}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch governance feed');

  const data = await readJsonResponse<{
    success: boolean;
    applications: Application[];
    daoPolicy?: GovernanceDaoPolicy | null;
    daoAccountId?: string;
  }>(res);

  return {
    applications: data.applications,
    daoPolicy: data.daoPolicy ?? null,
    daoAccountId: data.daoAccountId ?? daoAccountId,
  };
}

export function readGovernanceFeedCache(
  daoAccountId: string
): GovernanceFeedResponse | null {
  const cached = readCachedFeed(daoAccountId);
  if (!cached) return null;

  const age = Date.now() - cached.fetchedAt;
  if (age >= STALE_MS) return null;

  return cached.data;
}

export async function fetchGovernanceFeedBootstrap(
  daoAccountId = resolveGovernanceDaoAccountId('governance'),
  limit = 20
): Promise<GovernanceFeedResponse | null> {
  try {
    const search = new URLSearchParams({
      limit: String(limit),
      daoAccountId,
    });
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
      body.proposals ?? [],
      daoAccountId
    );
    if (applications.length === 0) {
      return null;
    }

    return {
      applications,
      daoPolicy: body.daoPolicy,
      daoAccountId,
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

export async function fetchGovernanceFeedCached(
  daoAccountId = resolveGovernanceDaoAccountId('governance'),
  options?: {
    onRevalidate?: (data: GovernanceFeedResponse) => void;
    skipMemoryCache?: boolean;
  }
): Promise<GovernanceFeedResponse> {
  const now = Date.now();

  if (!options?.skipMemoryCache) {
    const cached = readCachedFeed(daoAccountId);
    if (cached) {
      const age = now - cached.fetchedAt;
      if (age < FRESH_MS) {
        return cached.data;
      }

      if (age < STALE_MS) {
        if (!cached.revalidatePromise) {
          cached.revalidatePromise = fetchGovernanceFeedFresh(daoAccountId)
            .then((data) => {
              writeCachedFeed(daoAccountId, data);
              options?.onRevalidate?.(data);
              return data;
            })
            .finally(() => {
              const cacheKey = feedCacheKey(daoAccountId);
              const entry = memoryCache.get(cacheKey) ?? cached;
              entry.revalidatePromise = undefined;
              memoryCache.set(cacheKey, entry);
            });
        }

        return cached.data;
      }
    }
  }

  const data = await fetchGovernanceFeedFresh(daoAccountId);
  writeCachedFeed(daoAccountId, data);
  return data;
}
