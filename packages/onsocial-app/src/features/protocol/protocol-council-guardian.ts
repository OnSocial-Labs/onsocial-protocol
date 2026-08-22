import type { ProtocolDaoPolicy } from '@/features/protocol/types';
import {
  formatDaoRoleLabel,
  sortDaoRoleIds,
} from '@/lib/page-drawer-meta';

/** Protocol Sputnik role ids that earn a name mark (Guardian wins over Council). */
export const PROTOCOL_COUNCIL_GUARDIAN_ROLE_IDS = [
  'guardians',
  'council',
] as const;

export type ProtocolCouncilGuardianRoleId =
  (typeof PROTOCOL_COUNCIL_GUARDIAN_ROLE_IDS)[number];

function normalizeAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

function isProtocolCouncilGuardianRoleId(
  roleId: string
): roleId is ProtocolCouncilGuardianRoleId {
  return roleId === 'guardians' || roleId === 'council';
}

/** Primary role id — guardians before council. */
export function primaryProtocolCouncilGuardianRoleId(
  roleIds: readonly string[]
): ProtocolCouncilGuardianRoleId | null {
  const filtered = roleIds
    .map((id) => id.trim().toLowerCase())
    .filter(isProtocolCouncilGuardianRoleId);
  if (filtered.length === 0) return null;
  const sorted = sortDaoRoleIds(filtered);
  const first = sorted[0];
  return first === 'guardians' || first === 'council' ? first : null;
}

/** Map Joined / API labels back to role ids. */
export function primaryProtocolCouncilGuardianRoleIdFromLabels(
  labels: readonly string[]
): ProtocolCouncilGuardianRoleId | null {
  const ids: string[] = [];
  for (const label of labels) {
    const key = label.trim().toLowerCase();
    if (key === 'guardian' || key === 'guardians') ids.push('guardians');
    if (key === 'council') ids.push('council');
  }
  return primaryProtocolCouncilGuardianRoleId(ids);
}

export function protocolCouncilGuardianRoleIdForAccount(
  policy: ProtocolDaoPolicy | null | undefined,
  accountId: string
): ProtocolCouncilGuardianRoleId | null {
  const normalized = normalizeAccountId(accountId);
  if (!normalized || !policy?.roles?.length) return null;

  const matched: string[] = [];
  for (const role of policy.roles) {
    const roleName = role.name?.trim().toLowerCase() ?? '';
    if (!isProtocolCouncilGuardianRoleId(roleName)) continue;
    const inGroup = role.kind?.Group?.some(
      (member) => normalizeAccountId(member) === normalized
    );
    if (inGroup) matched.push(roleName);
  }
  return primaryProtocolCouncilGuardianRoleId(matched);
}

/**
 * Account → primary guardians/council role from a DAO policy.
 * Guardians wins when an account is in both groups.
 */
export function protocolCouncilGuardianRoleByAccount(
  policy: ProtocolDaoPolicy | null | undefined
): Map<string, ProtocolCouncilGuardianRoleId> {
  const idsByAccount = new Map<string, string[]>();
  if (!policy?.roles?.length) return new Map();

  for (const role of policy.roles) {
    const roleName = role.name?.trim().toLowerCase() ?? '';
    if (!isProtocolCouncilGuardianRoleId(roleName)) continue;
    for (const raw of role.kind?.Group ?? []) {
      const id = normalizeAccountId(raw);
      if (!id) continue;
      const list = idsByAccount.get(id) ?? [];
      list.push(roleName);
      idsByAccount.set(id, list);
    }
  }

  const out = new Map<string, ProtocolCouncilGuardianRoleId>();
  for (const [accountId, roleIds] of idsByAccount) {
    const primary = primaryProtocolCouncilGuardianRoleId(roleIds);
    if (primary) out.set(accountId, primary);
  }
  return out;
}

export function protocolCouncilGuardianMarkLabel(
  roleId: ProtocolCouncilGuardianRoleId
): string {
  return formatDaoRoleLabel(roleId);
}
