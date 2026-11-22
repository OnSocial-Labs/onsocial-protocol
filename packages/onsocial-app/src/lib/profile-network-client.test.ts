import { afterEach, describe, expect, it, vi } from 'vitest';
import * as profileNetworkApi from './profile-network-client';
import { fetchNetworkOrbit } from './profile-network-client';

/** Matches PROFILE_NETWORK_CACHE_MAX — a graph walk plus a few searches. */
const PROFILE_NETWORK_CACHE_MAX = 48;

function resetNetworkCache(): void {
  const clear = (
    profileNetworkApi as { clearProfileNetworkCacheForTests?: () => void }
  ).clearProfileNetworkCacheForTests;
  clear?.();
}

function orbitResponse(): Response {
  return new Response(
    JSON.stringify({
      accounts: [],
      counts: { incoming: 1, outgoing: 0, mutual: 0 },
      centerMood: null,
      viewerKnownCount: 0,
      subjectEndorsedCount: 0,
      search: null,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

describe('profile network cache bound', () => {
  afterEach(() => {
    resetNetworkCache();
    vi.unstubAllGlobals();
  });

  it('evicts the oldest orbit past the cap', async () => {
    const published = (
      profileNetworkApi as { PROFILE_NETWORK_CACHE_MAX?: number }
    ).PROFILE_NETWORK_CACHE_MAX;
    if (published !== undefined) {
      expect(published).toBe(PROFILE_NETWORK_CACHE_MAX);
    }
    const fetchMock = vi.fn(() => Promise.resolve(orbitResponse()));
    vi.stubGlobal('fetch', fetchMock);

    for (let i = 0; i < PROFILE_NETWORK_CACHE_MAX + 1; i += 1) {
      await fetchNetworkOrbit({
        accountId: `p${i}.near`,
        viewerAccountId: null,
      });
    }
    await fetchNetworkOrbit({ accountId: 'p0.near', viewerAccountId: null });
    expect(fetchMock).toHaveBeenCalledTimes(PROFILE_NETWORK_CACHE_MAX + 2);
    await fetchNetworkOrbit({
      accountId: `p${PROFILE_NETWORK_CACHE_MAX}.near`,
      viewerAccountId: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(PROFILE_NETWORK_CACHE_MAX + 2);
  });

  it('does not refresh recency on read — the oldest write is evicted', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(orbitResponse()));
    vi.stubGlobal('fetch', fetchMock);

    for (let i = 0; i < PROFILE_NETWORK_CACHE_MAX; i += 1) {
      await fetchNetworkOrbit({
        accountId: `q${i}.near`,
        viewerAccountId: null,
      });
    }
    await fetchNetworkOrbit({ accountId: 'q0.near', viewerAccountId: null });
    expect(fetchMock).toHaveBeenCalledTimes(PROFILE_NETWORK_CACHE_MAX);
    await fetchNetworkOrbit({
      accountId: `q${PROFILE_NETWORK_CACHE_MAX}.near`,
      viewerAccountId: null,
    });
    await fetchNetworkOrbit({ accountId: 'q1.near', viewerAccountId: null });
    expect(fetchMock).toHaveBeenCalledTimes(PROFILE_NETWORK_CACHE_MAX + 1);
    await fetchNetworkOrbit({ accountId: 'q0.near', viewerAccountId: null });
    expect(fetchMock).toHaveBeenCalledTimes(PROFILE_NETWORK_CACHE_MAX + 2);
  });
});
