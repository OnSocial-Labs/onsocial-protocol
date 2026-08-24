import type { ProtocolDaoRole } from '@/features/protocol/types';

export function isEveryoneDaoRole(role: ProtocolDaoRole): boolean {
  const kind = role.kind;
  if (kind === 'Everyone') return true;
  return Boolean(kind && typeof kind === 'object' && 'Everyone' in kind);
}

export function daoRoleGroupMembers(role: ProtocolDaoRole): string[] {
  const kind = role.kind;
  if (!kind || typeof kind === 'string') return [];
  return kind.Group ?? [];
}

export function daoRoleMemberThreshold(role: ProtocolDaoRole): string | null {
  const kind = role.kind;
  if (!kind || typeof kind === 'string') return null;
  const raw = kind.Member;
  if (raw == null || raw === '') return null;
  try {
    return BigInt(raw).toString();
  } catch {
    return null;
  }
}
