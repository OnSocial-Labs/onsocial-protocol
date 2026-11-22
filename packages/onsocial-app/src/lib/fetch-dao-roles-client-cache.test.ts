import { afterEach, describe, expect, it, vi } from 'vitest';
import * as daoRolesClientApi from './fetch-dao-roles-client';
import { fetchDaoRolesClient } from './fetch-dao-roles-client';

/** Matches DAO_ROLES_CLIENT_CACHE_MAX — unseeded accounts in a few minutes. */
const DAO_ROLES_CLIENT_CACHE_MAX = 200;

function resetDaoRolesCache(): void {
  const clear = (
    daoRolesClientApi as { clearDaoRolesClientCacheForTests?: () => void }
  ).clearDaoRolesClientCacheForTests;
  clear?.();
}

function rolesResponse(accountId: string): Response {
  return new Response(
    JSON.stringify({
      accountId,
      daoRoleIds: [accountId],
      daoRoleLabels: ['Council'],
      memberships: {
        governance: null,
        treasury: null,
        proposer: { governance: false, treasury: false },
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

describe('fetchDaoRolesClient cache bound', () => {
  afterEach(() => {
    resetDaoRolesCache();
    vi.unstubAllGlobals();
  });

  it('evicts the oldest account past the cap', async () => {
    const published = (
      daoRolesClientApi as { DAO_ROLES_CLIENT_CACHE_MAX?: number }
    ).DAO_ROLES_CLIENT_CACHE_MAX;
    if (published !== undefined) {
      expect(published).toBe(DAO_ROLES_CLIENT_CACHE_MAX);
    }
    const fetchMock = vi.fn((input: RequestInfo) => {
      const accountId = new URL(String(input), 'http://local').searchParams.get(
        'accountId'
      );
      return Promise.resolve(rolesResponse(accountId ?? ''));
    });
    vi.stubGlobal('fetch', fetchMock);

    for (let i = 0; i < DAO_ROLES_CLIENT_CACHE_MAX + 1; i += 1) {
      await fetchDaoRolesClient(`r${i}.near`);
    }
    await fetchDaoRolesClient('r0.near');
    expect(fetchMock).toHaveBeenCalledTimes(DAO_ROLES_CLIENT_CACHE_MAX + 2);
    await fetchDaoRolesClient(`r${DAO_ROLES_CLIENT_CACHE_MAX}.near`);
    expect(fetchMock).toHaveBeenCalledTimes(DAO_ROLES_CLIENT_CACHE_MAX + 2);
  });

  it('does not refresh recency on read — the oldest write is evicted', async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const accountId = new URL(String(input), 'http://local').searchParams.get(
        'accountId'
      );
      return Promise.resolve(rolesResponse(accountId ?? ''));
    });
    vi.stubGlobal('fetch', fetchMock);

    for (let i = 0; i < DAO_ROLES_CLIENT_CACHE_MAX; i += 1) {
      await fetchDaoRolesClient(`s${i}.near`);
    }
    await fetchDaoRolesClient('s0.near');
    expect(fetchMock).toHaveBeenCalledTimes(DAO_ROLES_CLIENT_CACHE_MAX);
    await fetchDaoRolesClient(`s${DAO_ROLES_CLIENT_CACHE_MAX}.near`);
    await fetchDaoRolesClient('s1.near');
    expect(fetchMock).toHaveBeenCalledTimes(DAO_ROLES_CLIENT_CACHE_MAX + 1);
    await fetchDaoRolesClient('s0.near');
    expect(fetchMock).toHaveBeenCalledTimes(DAO_ROLES_CLIENT_CACHE_MAX + 2);
  });
});
