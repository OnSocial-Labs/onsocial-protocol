'use client';

import { ProtocolGuardianRoleMark } from '@/features/protocol/protocol-identity-mark-button';
import type { ProtocolCouncilGuardianRoleId } from '@/features/protocol/protocol-council-guardian';

/**
 * Single-DAO surface mark (proposal voters / members when policy is already known).
 * Person faces & lists use {@link ProtocolNameTrailing} soft-fill instead.
 */
export function ProtocolCouncilGuardianMark({
  roleId,
}: {
  roleId: ProtocolCouncilGuardianRoleId | null | undefined;
  size?: 'face' | 'row';
}) {
  if (!roleId) return null;
  return <ProtocolGuardianRoleMark roleId={roleId} />;
}
