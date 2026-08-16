import { pool, query } from '../db/index.js';
import type { GovernanceDaoPolicySnapshot } from './governance-proposal-policy-snapshot.js';
import {
  countGroupRolesInPolicy,
  extractGroupMembershipsFromPolicy,
} from './governance-dao-membership.js';

export type DaoMembershipRow = {
  accountId: string;
  daoAccountId: string;
  roleNames: string[];
  updatedAt: string;
};

export type DaoPolicySyncRow = {
  daoAccountId: string;
  syncedAt: string;
  roleCount: number;
  memberCount: number;
};

function normalizeAccountId(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function normalizeDaoAccountId(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export { extractGroupMembershipsFromPolicy } from './governance-dao-membership.js';

/**
 * Replace current membership rows for one DAO from a live policy snapshot.
 * Removals stay correct because the set is wholesale-replaced.
 */
export async function replaceDaoMembershipsFromPolicy(
  daoAccountIdInput: string,
  policy: GovernanceDaoPolicySnapshot | null
): Promise<{ roleCount: number; memberCount: number }> {
  const daoAccountId = normalizeDaoAccountId(daoAccountIdInput);
  if (!daoAccountId) {
    return { roleCount: 0, memberCount: 0 };
  }

  const memberships = extractGroupMembershipsFromPolicy(policy);
  const roleCount = countGroupRolesInPolicy(policy);
  const memberCount = memberships.size;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM governance_dao_memberships WHERE dao_account_id = $1`,
      [daoAccountId]
    );

    for (const [accountId, roleNames] of memberships) {
      await client.query(
        `INSERT INTO governance_dao_memberships (
           account_id, dao_account_id, role_names, updated_at
         ) VALUES ($1, $2, $3::text[], now())`,
        [accountId, daoAccountId, roleNames]
      );
    }

    await client.query(
      `INSERT INTO governance_dao_policy_sync (
         dao_account_id, synced_at, role_count, member_count
       ) VALUES ($1, now(), $2, $3)
       ON CONFLICT (dao_account_id) DO UPDATE SET
         synced_at = excluded.synced_at,
         role_count = excluded.role_count,
         member_count = excluded.member_count`,
      [daoAccountId, roleCount, memberCount]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { roleCount, memberCount };
}

export async function listMyDaoMemberships(accountIdInput: string): Promise<
  Array<
    DaoMembershipRow & {
      name: string | null;
      purpose: string | null;
      metadata: string | null;
    }
  >
> {
  const accountId = normalizeAccountId(accountIdInput);
  if (!accountId) return [];

  const result = await query<{
    account_id: string;
    dao_account_id: string;
    role_names: string[] | null;
    updated_at: string | Date;
    name: string | null;
    purpose: string | null;
    metadata: string | null;
  }>(
    `SELECT m.account_id,
            m.dao_account_id,
            m.role_names,
            m.updated_at,
            c.name,
            c.purpose,
            c.metadata
       FROM governance_dao_memberships m
       LEFT JOIN governance_dao_catalog c
         ON c.dao_account_id = m.dao_account_id
      WHERE m.account_id = $1
      ORDER BY m.updated_at DESC, m.dao_account_id ASC`,
    [accountId]
  );

  return result.rows.map((row) => ({
    accountId: row.account_id,
    daoAccountId: row.dao_account_id,
    roleNames: Array.isArray(row.role_names) ? row.role_names : [],
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
    name: row.name,
    purpose: row.purpose,
    metadata: row.metadata,
  }));
}

export async function listIndexedDaoAccountIds(): Promise<string[]> {
  const result = await query<{ dao_account_id: string }>(
    `SELECT dao_account_id
       FROM governance_dao_policy_sync
      ORDER BY synced_at DESC, dao_account_id ASC`
  );
  return result.rows.map((row) => row.dao_account_id);
}
