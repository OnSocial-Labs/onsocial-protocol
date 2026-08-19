import { getDaoCatalogRowsByIds } from './governance-dao-catalog-store.js';
import { kickDaoProposalsSync } from './governance-dao-proposal-sync.js';
import {
  DAO_PROPOSAL_PEEK_DAO_LIMIT,
  DAO_PROPOSAL_PEEK_ROW_LIMIT,
  loadDaoProposalSnapshotsForDaos,
  type StoredDaoProposalRow,
} from './governance-dao-proposal-store.js';

const DAO_ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export type DaoProposalPeek = {
  daoAccountId: string;
  daoName: string;
  proposalId: number;
  label: string;
  status: string;
  createdAt: string;
  open: boolean;
};

export function normalizeDaoProposalPeekDaoIds(
  daoAccountIds: string[]
): string[] {
  return Array.from(
    new Set(
      daoAccountIds
        .map((id) => id.trim().toLowerCase())
        .filter((id) => DAO_ACCOUNT_PATTERN.test(id))
    )
  ).slice(0, DAO_PROPOSAL_PEEK_DAO_LIMIT);
}

export function isOpenDaoProposalPeekStatus(status: string): boolean {
  return status === 'InProgress' || status.toLowerCase() === 'open';
}

function parseSubmissionTimeToIso(value: string | undefined): string {
  if (!value) {
    return new Date(0).toISOString();
  }

  try {
    const milliseconds = Number(BigInt(value) / 1_000_000n);
    if (!Number.isFinite(milliseconds)) {
      return new Date(0).toISOString();
    }
    return new Date(milliseconds).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

export function peekLabelFromSnapshot(row: StoredDaoProposalRow): string {
  const fromDesc = row.proposalSnapshot.description
    ?.trim()
    .split('\n')[0]
    ?.trim();
  if (fromDesc) {
    return fromDesc.slice(0, 120);
  }
  return `Proposal #${row.proposalId}`;
}

export function mapStoredRowToDaoProposalPeek(
  row: StoredDaoProposalRow,
  daoNameById: Map<string, string>
): DaoProposalPeek {
  const status = row.status || row.proposalSnapshot.status || 'InProgress';
  return {
    daoAccountId: row.daoAccountId,
    daoName: daoNameById.get(row.daoAccountId) ?? row.daoAccountId,
    proposalId: row.proposalId,
    label: peekLabelFromSnapshot(row),
    status,
    createdAt: parseSubmissionTimeToIso(
      row.submissionTime || row.proposalSnapshot.submission_time
    ),
    open: isOpenDaoProposalPeekStatus(status),
  };
}

/**
 * Membership-scoped proposal peeks for DAOs Home.
 * One snapshot query across DAOs; kicks per-DAO sync in the background.
 * Intentionally skips partner_keys, full feed hydrate, and get_policy.
 */
export async function getDaoProposalPeeks(
  daoAccountIds: string[],
  limit: number = DAO_PROPOSAL_PEEK_ROW_LIMIT
): Promise<{
  peeks: DaoProposalPeek[];
  daoAccountIds: string[];
  limit: number;
}> {
  const ids = normalizeDaoProposalPeekDaoIds(daoAccountIds);
  const safeLimit =
    Number.isFinite(limit) && limit > 0
      ? Math.min(Math.trunc(limit), DAO_PROPOSAL_PEEK_ROW_LIMIT)
      : DAO_PROPOSAL_PEEK_ROW_LIMIT;

  if (ids.length === 0) {
    return { peeks: [], daoAccountIds: ids, limit: safeLimit };
  }

  for (const daoAccountId of ids) {
    void kickDaoProposalsSync(daoAccountId).catch(() => {
      // Background catch-up only; peeks still paint from persisted rows.
    });
  }

  const [rows, catalog] = await Promise.all([
    loadDaoProposalSnapshotsForDaos(ids, safeLimit),
    getDaoCatalogRowsByIds(ids, DAO_PROPOSAL_PEEK_DAO_LIMIT),
  ]);

  const daoNameById = new Map<string, string>();
  for (const row of catalog) {
    const name = row.name?.trim();
    if (name) {
      daoNameById.set(row.daoAccountId, name);
    }
  }

  const peeks = rows.map((row) =>
    mapStoredRowToDaoProposalPeek(row, daoNameById)
  );

  return { peeks, daoAccountIds: ids, limit: safeLimit };
}
