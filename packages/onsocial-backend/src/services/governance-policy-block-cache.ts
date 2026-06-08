import type { GovernanceDaoPolicySnapshot } from './governance-proposal-policy-snapshot.js';

const policyByBlockCache = new Map<string, GovernanceDaoPolicySnapshot>();
const inFlightFetches = new Map<
  string,
  Promise<GovernanceDaoPolicySnapshot | null>
>();

function cacheKey(daoAccountId: string, blockHeight: number): string {
  return `${daoAccountId}:${blockHeight}`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry<T>(
  fetch: () => Promise<T>,
  attempts = 4
): Promise<T | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch();
    } catch {
      if (attempt === attempts - 1) {
        return null;
      }
      await sleep(120 * (attempt + 1));
    }
  }

  return null;
}

/** Immutable historical policy — cache only successful lookups. */
export async function getDaoPolicyAtBlockCached(
  daoAccountId: string,
  blockHeight: number,
  fetch: () => Promise<GovernanceDaoPolicySnapshot | null>
): Promise<GovernanceDaoPolicySnapshot | null> {
  const key = cacheKey(daoAccountId, blockHeight);
  const cached = policyByBlockCache.get(key);
  if (cached) {
    return cached;
  }

  const inFlight = inFlightFetches.get(key);
  if (inFlight) {
    return inFlight;
  }

  const promise = fetch()
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
