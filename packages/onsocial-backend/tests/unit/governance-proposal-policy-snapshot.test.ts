import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  loadPersistedPolicySnapshotsByProposalIds,
  persistProposalPolicySnapshot,
} = vi.hoisted(() => ({
  loadPersistedPolicySnapshotsByProposalIds: vi.fn(),
  persistProposalPolicySnapshot: vi.fn(),
}));

vi.mock('../../src/services/governance-proposal-policy-store.js', () => ({
  loadPersistedPolicySnapshotsByProposalIds,
  persistProposalPolicySnapshot,
}));

vi.mock('../../src/services/governance-policy-block-cache.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/services/governance-policy-block-cache.js')
  >('../../src/services/governance-policy-block-cache.js');

  return {
    ...actual,
    getDaoPolicyAtBlockCached: vi.fn(
      async (
        _daoAccountId: string,
        _blockHeight: number,
        fetch: () => Promise<unknown>
      ) => fetch()
    ),
  };
});

vi.mock('../../src/services/near.js', () => ({
  viewContractAtBlock: vi.fn(),
}));

import { resolveProposalPolicySnapshotsForRecords } from '../../src/services/governance-proposal-policy-snapshot.js';

describe('resolveProposalPolicySnapshotsForRecords', () => {
  const daoAccountId = 'governance.onsocial.testnet';
  const persistedPolicy = {
    roles: [{ name: 'guardians', kind: { Group: ['a.testnet', 'b.testnet'] } }],
    default_vote_policy: {
      weight_kind: 'RoleWeight',
      quorum: '0',
      threshold: [50, 100],
    },
  };
  const fetchedPolicy = {
    roles: [{ name: 'guardians', kind: { Group: ['a.testnet'] } }],
    default_vote_policy: {
      weight_kind: 'RoleWeight',
      quorum: '0',
      threshold: [50, 100],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    loadPersistedPolicySnapshotsByProposalIds.mockResolvedValue(new Map());
    persistProposalPolicySnapshot.mockResolvedValue(undefined);
  });

  it('returns persisted snapshots without fetching RPC', async () => {
    loadPersistedPolicySnapshotsByProposalIds.mockResolvedValue(
      new Map([[22, persistedPolicy]])
    );

    const result = await resolveProposalPolicySnapshotsForRecords(
      daoAccountId,
      [
        {
          id: 22,
          status: 'Approved',
          last_actions_log: [{ block_height: '243788555' }],
        },
      ]
    );

    expect(result.get(22)).toEqual(persistedPolicy);
    expect(persistProposalPolicySnapshot).not.toHaveBeenCalled();
  });

  it('persists newly fetched snapshots for terminal proposals', async () => {
    const { viewContractAtBlock } = await import('../../src/services/near.js');
    vi.mocked(viewContractAtBlock).mockResolvedValue(fetchedPolicy);

    const result = await resolveProposalPolicySnapshotsForRecords(
      daoAccountId,
      [
        {
          id: 38,
          status: 'Approved',
          last_actions_log: [{ block_height: '12345' }],
        },
      ]
    );

    expect(result.get(38)).toEqual(fetchedPolicy);
    expect(persistProposalPolicySnapshot).toHaveBeenCalledWith({
      daoAccountId,
      proposalId: 38,
      submissionBlockHeight: 12345,
      policySnapshot: fetchedPolicy,
    });
  });
});
