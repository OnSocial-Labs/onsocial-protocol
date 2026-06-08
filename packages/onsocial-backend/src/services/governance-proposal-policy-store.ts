import { query } from '../db/index.js';
import type { GovernanceDaoPolicySnapshot } from './governance-proposal-policy-snapshot.js';

export type PersistedProposalPolicySnapshot = {
  proposalId: number;
  submissionBlockHeight: number;
  policySnapshot: GovernanceDaoPolicySnapshot;
};

function normalizeProposalId(value: unknown): number | null {
  const proposalId = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(proposalId) || proposalId < 0) {
    return null;
  }

  return proposalId;
}

export async function loadPersistedPolicySnapshotsByProposalIds(
  daoAccountId: string,
  proposalIds: number[]
): Promise<Map<number, GovernanceDaoPolicySnapshot>> {
  const uniqueIds = [...new Set(proposalIds)].filter(
    (proposalId) => Number.isInteger(proposalId) && proposalId >= 0
  );

  if (uniqueIds.length === 0) {
    return new Map();
  }

  const result = await query<{
    proposal_id: string | number;
    policy_snapshot: GovernanceDaoPolicySnapshot;
  }>(
    `SELECT proposal_id, policy_snapshot
       FROM governance_proposal_policy_snapshots
      WHERE dao_account_id = $1
        AND proposal_id = ANY($2::bigint[])`,
    [daoAccountId, uniqueIds]
  );

  const snapshots = new Map<number, GovernanceDaoPolicySnapshot>();

  for (const row of result.rows) {
    const proposalId = normalizeProposalId(row.proposal_id);
    if (proposalId === null || !row.policy_snapshot) {
      continue;
    }

    snapshots.set(proposalId, row.policy_snapshot);
  }

  return snapshots;
}

export async function persistProposalPolicySnapshot({
  daoAccountId,
  proposalId,
  submissionBlockHeight,
  policySnapshot,
}: {
  daoAccountId: string;
  proposalId: number;
  submissionBlockHeight: number;
  policySnapshot: GovernanceDaoPolicySnapshot;
}): Promise<void> {
  if (
    !Number.isInteger(proposalId) ||
    proposalId < 0 ||
    !Number.isInteger(submissionBlockHeight) ||
    submissionBlockHeight <= 0
  ) {
    return;
  }

  await query(
    `INSERT INTO governance_proposal_policy_snapshots (
       dao_account_id,
       proposal_id,
       submission_block_height,
       policy_snapshot
     )
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (dao_account_id, proposal_id) DO NOTHING`,
    [
      daoAccountId,
      proposalId,
      submissionBlockHeight,
      JSON.stringify(policySnapshot),
    ]
  );
}

export async function loadPersistedPolicySnapshot(
  daoAccountId: string,
  proposalId: number
): Promise<PersistedProposalPolicySnapshot | null> {
  if (!Number.isInteger(proposalId) || proposalId < 0) {
    return null;
  }

  const result = await query<{
    proposal_id: string | number;
    submission_block_height: string | number;
    policy_snapshot: GovernanceDaoPolicySnapshot;
  }>(
    `SELECT proposal_id, submission_block_height, policy_snapshot
       FROM governance_proposal_policy_snapshots
      WHERE dao_account_id = $1
        AND proposal_id = $2
      LIMIT 1`,
    [daoAccountId, proposalId]
  );

  const row = result.rows[0];
  const normalizedProposalId = normalizeProposalId(row?.proposal_id);
  const submissionBlockHeight = Number(row?.submission_block_height);

  if (
    normalizedProposalId === null ||
    !row?.policy_snapshot ||
    !Number.isFinite(submissionBlockHeight) ||
    submissionBlockHeight <= 0
  ) {
    return null;
  }

  return {
    proposalId: normalizedProposalId,
    submissionBlockHeight,
    policySnapshot: row.policy_snapshot,
  };
}
