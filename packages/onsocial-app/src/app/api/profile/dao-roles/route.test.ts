import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const memberships = vi.fn(async (_accountId: string) => ({
  governance: 'council' as const,
  treasury: null,
}));
const proposer = vi.fn(async (_accountId: string) => ({
  governance: false,
  treasury: false,
}));
const batched = vi.fn(async (_accountIds: string[]) => ({
  'bob.near': {
    governance: null,
    treasury: 'guardians' as const,
    proposer: { governance: false, treasury: false },
  },
}));

vi.mock('@/lib/fetch-page-drawer-meta', () => ({
  fetchProtocolDaoMemberships: (accountId: string) => memberships(accountId),
  fetchProtocolDaoProposerFlags: (accountId: string) => proposer(accountId),
  resolveDaoMembershipsForAccounts: (accountIds: string[]) => batched(accountIds),
}));

describe('dao-roles route', () => {
  beforeEach(() => {
    memberships.mockClear();
    proposer.mockClear();
    batched.mockClear();
  });

  it('keeps the single-account request and response', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/profile/dao-roles?accountId=alice.near'
      )
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(memberships).toHaveBeenCalledWith('alice.near');
    expect(proposer).toHaveBeenCalledWith('alice.near');
    expect(batched).not.toHaveBeenCalled();
    expect(body.accountId).toBe('alice.near');
    expect(body.daoRoleIds).toEqual(['council']);
    expect(body.daoRoleLabels).toEqual(expect.any(Array));
    expect(body.memberships).toMatchObject({
      governance: 'council',
      treasury: null,
    });
    expect(body.accounts).toBeUndefined();
  });

  it('adds a batch response without replacing the single-account route', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/profile/dao-roles?accountIds=bob.near'
      )
    );
    const body = (await response.json()) as {
      accounts: Array<{ accountId: string }>;
    };

    expect(batched).toHaveBeenCalledTimes(1);
    expect(memberships).not.toHaveBeenCalled();
    expect(body.accounts[0]?.accountId).toBe('bob.near');
  });
});
