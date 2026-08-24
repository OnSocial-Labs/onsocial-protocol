import {
  daoRoleGroupMembers,
  daoRoleMemberThreshold,
} from '@/features/protocol/protocol-propose-gate';
import type { ProtocolDaoPolicy, ProtocolDaoRole } from '@/features/protocol/types';

export interface DaoGroupRoleSection {
  roleName: string;
  accountIds: string[];
}

/** Stake-weighted Member role — threshold only (no on-chain people list). */
export interface DaoMemberThresholdSection {
  roleName: string;
  thresholdYocto: string;
}

export type DaoMembershipSection =
  | ({ kind: 'group' } & DaoGroupRoleSection)
  | ({ kind: 'member' } & DaoMemberThresholdSection);

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

/** Member-kind roles with a positive stake threshold. */
export function listDaoMemberThresholdSections(
  policy: ProtocolDaoPolicy | null | undefined
): DaoMemberThresholdSection[] {
  const roles = policy?.roles ?? [];
  const sections: DaoMemberThresholdSection[] = [];

  for (const role of roles) {
    const roleName = role.name?.trim();
    if (!roleName) continue;
    const threshold = memberThresholdYocto(role);
    if (!threshold) continue;
    sections.push({ roleName, thresholdYocto: threshold });
  }

  return sections;
}

/**
 * Members overlay sections — Group people first, then stake-threshold roles.
 * Matches the Group-or-stake propose model shown on the face.
 */
export function listDaoMembershipSections(
  policy: ProtocolDaoPolicy | null | undefined
): DaoMembershipSection[] {
  return [
    ...listDaoGroupRoleSections(policy).map((section) => ({
      kind: 'group' as const,
      ...section,
    })),
    ...listDaoMemberThresholdSections(policy).map((section) => ({
      kind: 'member' as const,
      ...section,
    })),
  ];
}

function uniqueGroupMembers(role: ProtocolDaoRole): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of daoRoleGroupMembers(role)) {
    const id = normalizeAccount(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function memberThresholdYocto(role: ProtocolDaoRole): string | null {
  const raw = daoRoleMemberThreshold(role);
  if (raw == null) return null;
  try {
    const value = BigInt(raw);
    if (value <= 0n) return null;
    return value.toString();
  } catch {
    return null;
  }
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
