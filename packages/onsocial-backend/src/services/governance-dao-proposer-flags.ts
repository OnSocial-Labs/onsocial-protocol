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
