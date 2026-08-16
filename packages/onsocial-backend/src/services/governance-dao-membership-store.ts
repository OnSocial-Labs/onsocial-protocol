import { pool, query } from '../db/index.js';
import type { GovernanceDaoPolicySnapshot } from './governance-proposal-policy-snapshot.js';

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

type PolicyRole = {
  name?: string;
  kind?: { Group?: string[]; Member?: string };
};

function normalizeAccountId(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function normalizeDaoAccountId(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function asPolicyRoles(
  policy: GovernanceDaoPolicySnapshot | null
): PolicyRole[] {
  if (!policy || !Array.isArray(policy.roles)) return [];
  return policy.roles as PolicyRole[];
}

/** Extract Group-role membership map from a live get_policy snapshot. */
export function extractGroupMembershipsFromPolicy(
  policy: GovernanceDaoPolicySnapshot | null
): Map<string, string[]> {
  const byAccount = new Map<string, Set<string>>();

  for (const role of asPolicyRoles(policy)) {
    const roleName = role.name?.trim();
    const group = role.kind?.Group;
    if (!roleName || !Array.isArray(group) || group.length === 0) continue;

    for (const member of group) {
      const accountId = normalizeAccountId(member);
      if (!accountId) continue;
      const roles = byAccount.get(accountId) ?? new Set<string>();
      roles.add(roleName);
      byAccount.set(accountId, roles);
    }
  }

  const result = new Map<string, string[]>();
  for (const [accountId, roles] of byAccount) {
    result.set(
      accountId,
      [...roles].sort((left, right) => left.localeCompare(right))
    );
  }
  return result;
}

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
  const roleCount = asPolicyRoles(policy).filter(
    (role) => role.name?.trim() && Array.isArray(role.kind?.Group)
  ).length;
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

export async function listMyDaoMemberships(
  accountIdInput: string
): Promise<DaoMembershipRow[]> {
  const accountId = normalizeAccountId(accountIdInput);
  if (!accountId) return [];

  const result = await query<{
    account_id: string;
    dao_account_id: string;
    role_names: string[] | null;
    updated_at: string | Date;
  }>(
    `SELECT account_id, dao_account_id, role_names, updated_at
       FROM governance_dao_memberships
      WHERE account_id = $1
      ORDER BY updated_at DESC, dao_account_id ASC`,
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
