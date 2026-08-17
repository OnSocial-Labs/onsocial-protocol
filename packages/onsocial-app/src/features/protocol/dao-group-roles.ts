import type { ProtocolDaoPolicy, ProtocolDaoRole } from '@/features/protocol/types';

export interface DaoGroupRoleSection {
  roleName: string;
  accountIds: string[];
}

function normalizeAccount(value: string): string {
  return value.trim().toLowerCase();
}

/** Group-kind roles from a Sputnik policy snapshot (people = circles). */
export function listDaoGroupRoleSections(
  policy: ProtocolDaoPolicy | null | undefined
): DaoGroupRoleSection[] {
  const roles = policy?.roles ?? [];
  const sections: DaoGroupRoleSection[] = [];

  for (const role of roles) {
    const roleName = role.name?.trim();
    if (!roleName) continue;
    const members = uniqueGroupMembers(role);
    if (members.length === 0) continue;
    sections.push({ roleName, accountIds: members });
  }

  return sections;
}

function uniqueGroupMembers(role: ProtocolDaoRole): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of role.kind?.Group ?? []) {
    const id = normalizeAccount(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function countDaoGroupMembers(
  policy: ProtocolDaoPolicy | null | undefined
): number {
  const seen = new Set<string>();
  for (const section of listDaoGroupRoleSections(policy)) {
    for (const id of section.accountIds) seen.add(id);
  }
  return seen.size;
}
