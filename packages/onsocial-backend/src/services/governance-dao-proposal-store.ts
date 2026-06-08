import { query } from '../db/index.js';
import type { GovernanceDaoPolicySnapshot } from './governance-proposal-policy-snapshot.js';

export type PersistedDaoProposalSnapshot = {
  id: number;
  proposer: string;
  description: string;
  kind: Record<string, unknown>;
  status: string;
  vote_counts: Record<string, [string, string, string]>;
  votes: Record<string, string>;
  submission_time: string;
  resolved_at?: string | null;
  last_actions_log?: Array<{ block_height: string }>;
  policy_snapshot?: GovernanceDaoPolicySnapshot | null;
};

export type StoredDaoProposalRow = {
  daoAccountId: string;
  proposalId: number;
  status: string;
  submissionTime: string;
  submissionBlockHeight: number | null;
  resolvedBlockHeight: number | null;
  resolvedAt: string | null;
  proposalSnapshot: PersistedDaoProposalSnapshot;
  policySnapshot: GovernanceDaoPolicySnapshot | null;
  syncedAt: string;
  updatedAt: string;
};

function normalizeProposalId(value: unknown): number | null {
  const proposalId = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(proposalId) || proposalId < 0) {
    return null;
  }

  return proposalId;
}

function mapStoredRow(row: {
  dao_account_id: string;
  proposal_id: string | number;
  status: string;
  submission_time: string;
  submission_block_height: string | number | null;
  resolved_block_height: string | number | null;
  resolved_at: string | null;
  proposal_snapshot: PersistedDaoProposalSnapshot;
  policy_snapshot: GovernanceDaoPolicySnapshot | null;
  synced_at: string | Date;
  updated_at: string | Date;
}): StoredDaoProposalRow | null {
  const proposalId = normalizeProposalId(row.proposal_id);
  if (proposalId === null || !row.proposal_snapshot) {
    return null;
  }

  const submissionBlockHeight = Number(row.submission_block_height);
  const resolvedBlockHeight = Number(row.resolved_block_height);

  return {
    daoAccountId: row.dao_account_id,
    proposalId,
    status: row.status,
    submissionTime: row.submission_time ?? '',
    submissionBlockHeight:
      Number.isFinite(submissionBlockHeight) && submissionBlockHeight > 0
        ? submissionBlockHeight
        : null,
    resolvedBlockHeight:
      Number.isFinite(resolvedBlockHeight) && resolvedBlockHeight > 0
        ? resolvedBlockHeight
        : null,
    resolvedAt: row.resolved_at,
    proposalSnapshot: {
      ...row.proposal_snapshot,
      id: row.proposal_snapshot.id ?? proposalId,
      policy_snapshot:
        row.policy_snapshot ?? row.proposal_snapshot.policy_snapshot,
      resolved_at: row.resolved_at ?? row.proposal_snapshot.resolved_at ?? null,
    },
    policySnapshot: row.policy_snapshot,
    syncedAt: new Date(row.synced_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function countDaoProposalSnapshots(
  daoAccountId: string
): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM governance_dao_proposal_snapshots
      WHERE dao_account_id = $1`,
    [daoAccountId]
  );

  return Number(result.rows[0]?.count ?? '0');
}

export async function getMaxPersistedProposalId(
  daoAccountId: string
): Promise<number | null> {
  const result = await query<{ max_id: string | null }>(
    `SELECT MAX(proposal_id)::text AS max_id
       FROM governance_dao_proposal_snapshots
      WHERE dao_account_id = $1`,
    [daoAccountId]
  );

  const maxId = Number(result.rows[0]?.max_id);
  return Number.isInteger(maxId) && maxId >= 0 ? maxId : null;
}

export async function loadAllDaoProposalSnapshots(
  daoAccountId: string
): Promise<StoredDaoProposalRow[]> {
  const result = await query<{
    dao_account_id: string;
    proposal_id: string | number;
    status: string;
    submission_time: string;
    submission_block_height: string | number | null;
    resolved_block_height: string | number | null;
    resolved_at: string | null;
    proposal_snapshot: PersistedDaoProposalSnapshot;
    policy_snapshot: GovernanceDaoPolicySnapshot | null;
    synced_at: string | Date;
    updated_at: string | Date;
  }>(
    `SELECT dao_account_id,
            proposal_id,
            status,
            submission_time,
            submission_block_height,
            resolved_block_height,
            resolved_at,
            proposal_snapshot,
            policy_snapshot,
            synced_at,
            updated_at
       FROM governance_dao_proposal_snapshots
      WHERE dao_account_id = $1
      ORDER BY proposal_id ASC`,
    [daoAccountId]
  );

  return result.rows
    .map((row) => mapStoredRow(row))
    .filter((row): row is StoredDaoProposalRow => row !== null);
}

export async function loadDaoProposalSnapshot(
  daoAccountId: string,
  proposalId: number
): Promise<StoredDaoProposalRow | null> {
  if (!Number.isInteger(proposalId) || proposalId < 0) {
    return null;
  }

  const result = await query<{
    dao_account_id: string;
    proposal_id: string | number;
    status: string;
    submission_time: string;
    submission_block_height: string | number | null;
    resolved_block_height: string | number | null;
    resolved_at: string | null;
    proposal_snapshot: PersistedDaoProposalSnapshot;
    policy_snapshot: GovernanceDaoPolicySnapshot | null;
    synced_at: string | Date;
    updated_at: string | Date;
  }>(
    `SELECT dao_account_id,
            proposal_id,
            status,
            submission_time,
            submission_block_height,
            resolved_block_height,
            resolved_at,
            proposal_snapshot,
            policy_snapshot,
            synced_at,
            updated_at
       FROM governance_dao_proposal_snapshots
      WHERE dao_account_id = $1
        AND proposal_id = $2
      LIMIT 1`,
    [daoAccountId, proposalId]
  );

  const row = result.rows[0];
  return row ? mapStoredRow(row) : null;
}

export async function persistDaoProposalSnapshot({
  daoAccountId,
  proposal,
  policySnapshot = null,
  submissionBlockHeight = null,
  resolvedBlockHeight = null,
  resolvedAt = null,
}: {
  daoAccountId: string;
  proposal: PersistedDaoProposalSnapshot;
  policySnapshot?: GovernanceDaoPolicySnapshot | null;
  submissionBlockHeight?: number | null;
  resolvedBlockHeight?: number | null;
  resolvedAt?: string | null;
}): Promise<void> {
  const proposalId = normalizeProposalId(proposal.id);
  if (proposalId === null) {
    return;
  }

  const snapshotPayload: PersistedDaoProposalSnapshot = {
    ...proposal,
    id: proposalId,
    policy_snapshot: policySnapshot ?? proposal.policy_snapshot ?? null,
    resolved_at: resolvedAt ?? proposal.resolved_at ?? null,
  };

  await query(
    `INSERT INTO governance_dao_proposal_snapshots (
       dao_account_id,
       proposal_id,
       status,
       submission_time,
       submission_block_height,
       resolved_block_height,
       resolved_at,
       proposal_snapshot,
       policy_snapshot,
       synced_at,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, now(), now())
     ON CONFLICT (dao_account_id, proposal_id) DO UPDATE
       SET status = EXCLUDED.status,
           submission_time = EXCLUDED.submission_time,
           submission_block_height = COALESCE(
             governance_dao_proposal_snapshots.submission_block_height,
             EXCLUDED.submission_block_height
           ),
           resolved_block_height = COALESCE(
             EXCLUDED.resolved_block_height,
             governance_dao_proposal_snapshots.resolved_block_height
           ),
           resolved_at = COALESCE(
             governance_dao_proposal_snapshots.resolved_at,
             EXCLUDED.resolved_at
           ),
           proposal_snapshot = EXCLUDED.proposal_snapshot,
           policy_snapshot = COALESCE(
             governance_dao_proposal_snapshots.policy_snapshot,
             EXCLUDED.policy_snapshot
           ),
           updated_at = now()`,
    [
      daoAccountId,
      proposalId,
      proposal.status,
      proposal.submission_time ?? '',
      submissionBlockHeight,
      resolvedBlockHeight,
      resolvedAt,
      JSON.stringify(snapshotPayload),
      policySnapshot ? JSON.stringify(policySnapshot) : null,
    ]
  );
}
