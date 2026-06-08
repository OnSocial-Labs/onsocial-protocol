import type { GovernanceDaoPolicy } from '@/features/governance/types';

const policyByBlockCache = new Map<string, GovernanceDaoPolicy>();
const inFlightFetches = new Map<string, Promise<GovernanceDaoPolicy | null>>();

function cacheKey(daoAccountId: string, blockHeight: number): string {
  return `${daoAccountId}:${blockHeight}`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry<T>(
  fetch: () => Promise<T | null>,
  attempts = 4
): Promise<T | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await fetch().catch(() => null);
    if (result) {
      return result;
    }
    if (attempt < attempts - 1) {
      await sleep(120 * (attempt + 1));
    }
  }

  return null;
}

/** Immutable historical policy — cache only successful lookups. */
export async function getDaoPolicyAtBlockCached(
  daoAccountId: string,
  blockHeight: number,
  fetch: () => Promise<GovernanceDaoPolicy | null>
): Promise<GovernanceDaoPolicy | null> {
  const key = cacheKey(daoAccountId, blockHeight);
  const cached = policyByBlockCache.get(key);
  if (cached) {
    return cached;
  }

  const inFlight = inFlightFetches.get(key);
  if (inFlight) {
    return inFlight;
  }

  const promise = fetchWithRetry(fetch)
    .then((policy) => {
      if (policy) {
        policyByBlockCache.set(key, policy);
      }
      return policy;
    })
    .finally(() => {
      inFlightFetches.delete(key);
    });

  inFlightFetches.set(key, promise);
  return promise;
}
