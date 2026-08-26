import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  primaryProtocolCouncilGuardianRoleId,
  primaryProtocolCouncilGuardianRoleIdFromLabels,
} from '@/features/protocol/protocol-council-guardian';
import { fetchDaoRolesClient } from '@/lib/fetch-dao-roles-client';

describe('dao role id / label bridging', () => {
  it('resolves primary role from API ids without label round-trip', () => {
    expect(
      primaryProtocolCouncilGuardianRoleId(['council', 'guardians'])
    ).toBe('guardians');
  });

  it('still accepts Joined-style labels', () => {
    expect(
      primaryProtocolCouncilGuardianRoleIdFromLabels(['Council', 'Guardian'])
    ).toBe('guardians');
  });
});

describe('fetchDaoRolesClient abort isolation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the shared request alive when one waiter aborts', async () => {
    const deferred: { resolve: ((value: Response) => void) | null } = {
      resolve: null,
    };
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          deferred.resolve = resolve;
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const controllerA = new AbortController();
    const waiterA = fetchDaoRolesClient('alice.near', controllerA.signal);
    const waiterB = fetchDaoRolesClient('alice.near');

    expect(fetchMock).toHaveBeenCalledTimes(1);

    controllerA.abort();
    await expect(waiterA).rejects.toMatchObject({ name: 'AbortError' });

    if (!deferred.resolve) {
      throw new Error('fetch mock did not capture resolve');
    }
    deferred.resolve(
      new Response(
        JSON.stringify({
          accountId: 'alice.near',
          daoRoleIds: ['guardians'],
          daoRoleLabels: ['Guardian'],
          memberships: {
            governance: 'guardians',
            treasury: null,
            proposer: { governance: true, treasury: false },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await expect(waiterB).resolves.toMatchObject({
      memberships: {
        governance: 'guardians',
        treasury: null,
        proposer: { governance: true, treasury: false },
      },
    });
  });
});
