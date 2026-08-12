import { describe, expect, it, vi } from 'vitest';
import { resolveGuildViewerAccess } from '@/features/guilds/guild-viewer-access';

function createMockClient(input: {
  membership?: {
    isOwner: boolean;
    isAdmin: boolean;
    canModerate: boolean;
  } | null;
  rpc?: Partial<{
    isOwner: boolean;
    isAdmin: boolean;
    canModerate: boolean;
    isMember: boolean;
    isBlacklisted: boolean;
  }>;
  listProposals?: () => Promise<never>;
}) {
  const rpc = {
    isOwner: false,
    isAdmin: false,
    canModerate: false,
    isMember: false,
    isBlacklisted: false,
    ...input.rpc,
  };

  return {
    query: {
      groups: {
        membershipFor: vi.fn(async () => input.membership ?? null),
      },
      governance: {
        joinRequests: vi.fn(async () => []),
      },
    },
    groups: {
      isOwner: vi.fn(async () => rpc.isOwner),
      isAdmin: vi.fn(async () => rpc.isAdmin),
      canModerate: vi.fn(async () => rpc.canModerate),
      isMember: vi.fn(async () => rpc.isMember),
      isBlacklisted: vi.fn(async () => rpc.isBlacklisted),
      getJoinRequest: vi.fn(async () => null),
      listProposals: input.listProposals
        ? vi.fn(input.listProposals)
        : vi.fn(async () => []),
    },
  } as unknown as import('@onsocial/sdk').OnSocial;
}

describe('resolveGuildViewerAccess', () => {
  it('reconciles owner from chain when indexer membership lacks role flags', async () => {
    const client = createMockClient({
      membership: {
        isOwner: false,
        isAdmin: false,
        canModerate: false,
      },
      rpc: {
        isOwner: true,
        isAdmin: true,
        canModerate: true,
      },
    });

    const { viewer, moderation } = await resolveGuildViewerAccess(
      client,
      'grp_test',
      'owner.testnet',
      { memberDriven: true, accessGated: true }
    );

    expect(viewer.isMember).toBe(true);
    expect(viewer.isOwner).toBe(true);
    expect(viewer.isAdmin).toBe(true);
    expect(viewer.canModerate).toBe(true);
    expect(moderation).not.toBeNull();
    expect(client.groups.isOwner).toHaveBeenCalled();
  });

  it('returns viewer roles even when proposal fetch fails', async () => {
    const client = createMockClient({
      membership: {
        isOwner: true,
        isAdmin: true,
        canModerate: true,
      },
      rpc: {
        isOwner: true,
        isAdmin: true,
        canModerate: true,
      },
      listProposals: async () => {
        throw new Error('proposals unavailable');
      },
    });

    const { viewer } = await resolveGuildViewerAccess(
      client,
      'grp_test',
      'owner.testnet',
      { memberDriven: true, accessGated: true }
    );

    expect(viewer.isOwner).toBe(true);
    expect(viewer.pendingJoinProposalId).toBeNull();
  });

  it('marks non-members as blacklisted when chain says so', async () => {
    const client = createMockClient({
      membership: null,
      rpc: {
        isBlacklisted: true,
      },
    });

    const { viewer } = await resolveGuildViewerAccess(
      client,
      'grp_test',
      'mallory.testnet',
      { memberDriven: false, accessGated: false }
    );

    expect(viewer.isMember).toBe(false);
    expect(viewer.isBlacklisted).toBe(true);
    expect(client.groups.isBlacklisted).toHaveBeenCalledWith(
      'grp_test',
      'mallory.testnet'
    );
  });
});
