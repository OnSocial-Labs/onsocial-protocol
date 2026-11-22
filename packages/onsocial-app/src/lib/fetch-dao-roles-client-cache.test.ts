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

  it('keeps the newer inflight when an evicted fetch rejects', async () => {
    let rejectFirst: ((error: Error) => void) | undefined;
    let resolveSecond: ((response: Response) => void) | undefined;
    let firstFetches = 0;
    const fetchMock = vi.fn((input: RequestInfo) => {
      const accountId = new URL(String(input), 'http://local').searchParams.get(
        'accountId'
      );
      if (accountId === 'first.near') {
        firstFetches += 1;
        if (firstFetches === 1) {
          return new Promise<Response>((_resolve, reject) => {
            rejectFirst = reject;
          });
        }
        return new Promise<Response>((resolve) => {
          resolveSecond = resolve;
        });
      }
      return Promise.resolve(rolesResponse(accountId ?? ''));
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = fetchDaoRolesClient('first.near');
    for (let i = 0; i < DAO_ROLES_CLIENT_CACHE_MAX; i += 1) {
      await fetchDaoRolesClient(`pad${i}.near`);
    }
    const second = fetchDaoRolesClient('first.near');
    if (!rejectFirst) throw new Error('first fetch did not start');
    rejectFirst(new Error('first fetch failed'));
    await first;

    const joined = fetchDaoRolesClient('first.near');
    expect(firstFetches).toBe(2);
    if (!resolveSecond) throw new Error('second fetch did not start');
    resolveSecond(rolesResponse('first.near'));
    await expect(second).resolves.toMatchObject({
      daoRoleIds: ['first.near'],
    });
    await expect(joined).resolves.toMatchObject({
      daoRoleIds: ['first.near'],
    });
    expect(firstFetches).toBe(2);
  });
});
