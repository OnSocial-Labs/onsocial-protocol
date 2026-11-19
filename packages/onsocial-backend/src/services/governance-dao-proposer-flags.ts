import { query } from '../db/index.js';
import { config } from '../config/index.js';

export type ProtocolDaoProposerFlags = {
  governance: boolean;
  treasury: boolean;
};

export const EMPTY_PROTOCOL_DAO_PROPOSER_FLAGS: ProtocolDaoProposerFlags = {
  governance: false,
  treasury: false,
};

function normalizeAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

/** Map distinct DAO ids from proposal snapshots to gov/treasury booleans. */
export function resolveProtocolDaoProposerFlags(
  proposedDaoAccountIds: string[],
  governanceDao: string = config.governanceDao,
  treasuryDao: string = config.treasuryDao
): ProtocolDaoProposerFlags {
  const normalized = new Set(
    proposedDaoAccountIds.map((id) => id.trim().toLowerCase()).filter(Boolean)
  );
  return {
    governance: normalized.has(governanceDao.trim().toLowerCase()),
    treasury: normalized.has(treasuryDao.trim().toLowerCase()),
  };
}

/** True when the account has submitted at least one proposal to a protocol DAO. */
export async function getProtocolDaoProposerFlags(
  accountId: string
): Promise<ProtocolDaoProposerFlags> {
  const normalized = normalizeAccountId(accountId);
  if (!normalized) {
    return EMPTY_PROTOCOL_DAO_PROPOSER_FLAGS;
  }

  const governanceDao = config.governanceDao.trim().toLowerCase();
  const treasuryDao = config.treasuryDao.trim().toLowerCase();

  const result = await query<{ dao_account_id: string }>(
    `SELECT DISTINCT dao_account_id
       FROM governance_dao_proposal_snapshots
      WHERE proposer_account_id = $1
        AND dao_account_id = ANY($2::text[])`,
    [normalized, [governanceDao, treasuryDao]]
  );

  return resolveProtocolDaoProposerFlags(
    result.rows.map((row) => row.dao_account_id),
    governanceDao,
    treasuryDao
  );
}

export function proposerFlagsByAccount(
  rows: Array<{ proposerAccountId: string; daoAccountId: string }>,
  accountIds: readonly string[],
  governanceDao: string = config.governanceDao,
  treasuryDao: string = config.treasuryDao
): Record<string, ProtocolDaoProposerFlags> {
  const byAccount = new Map<string, string[]>();
  for (const row of rows) {
    const accountId = normalizeAccountId(row.proposerAccountId);
    const daoAccountId = row.daoAccountId.trim().toLowerCase();
    if (!accountId || !daoAccountId) continue;
    const daos = byAccount.get(accountId) ?? [];
    daos.push(daoAccountId);
    byAccount.set(accountId, daos);
  }
  const out: Record<string, ProtocolDaoProposerFlags> = {};
  for (const accountId of accountIds) {
    const id = normalizeAccountId(accountId);
    if (!id) continue;
    out[id] = resolveProtocolDaoProposerFlags(
      byAccount.get(id) ?? [],
      governanceDao,
      treasuryDao
    );
  }
  return out;
}

/** One read for a feed page of authors. */
export async function getProtocolDaoProposerFlagsForAccounts(
  accountIds: readonly string[]
): Promise<Record<string, ProtocolDaoProposerFlags>> {
  const ids = [
    ...new Set(
      accountIds
        .map((id) => normalizeAccountId(id))
        .filter((id) => id.length > 0)
    ),
  ];
  if (ids.length === 0) return {};

  const governanceDao = config.governanceDao.trim().toLowerCase();
  const treasuryDao = config.treasuryDao.trim().toLowerCase();
  const result = await query<{
    proposer_account_id: string;
    dao_account_id: string;
  }>(
    `SELECT DISTINCT proposer_account_id, dao_account_id
       FROM governance_dao_proposal_snapshots
      WHERE proposer_account_id = ANY($1::text[])
        AND dao_account_id = ANY($2::text[])`,
    [ids, [governanceDao, treasuryDao]]
  );

  return proposerFlagsByAccount(
    result.rows.map((row) => ({
      proposerAccountId: row.proposer_account_id,
      daoAccountId: row.dao_account_id,
    })),
    ids,
    governanceDao,
    treasuryDao
  );
}
