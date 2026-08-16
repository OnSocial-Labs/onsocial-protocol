import type { GovernanceDaoPolicySnapshot } from './governance-proposal-policy-snapshot.js';

type PolicyRole = {
  name?: string;
  kind?: { Group?: string[]; Member?: string };
};

function normalizeAccountId(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function asPolicyRoles(
  policy: GovernanceDaoPolicySnapshot | null
): PolicyRole[] {
  if (!policy || !Array.isArray(policy.roles)) return [];
  return policy.roles as PolicyRole[];
}

/** Count named Group roles on a policy (for sync stats). */
export function countGroupRolesInPolicy(
  policy: GovernanceDaoPolicySnapshot | null
): number {
  return asPolicyRoles(policy).filter(
    (role) => role.name?.trim() && Array.isArray(role.kind?.Group)
  ).length;
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
