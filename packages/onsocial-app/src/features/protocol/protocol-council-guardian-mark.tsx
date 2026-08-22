'use client';

import {
  protocolCouncilGuardianMarkLabel,
  type ProtocolCouncilGuardianRoleId,
} from '@/features/protocol/protocol-council-guardian';

/**
 * Quiet same-line mark for protocol Guardian / Council (StandingIdentity
 * nameTrailing + portfolio face name row).
 */
export function ProtocolCouncilGuardianMark({
  roleId,
  size = 'row',
}: {
  roleId: ProtocolCouncilGuardianRoleId | null | undefined;
  /** `face` = denser title mark; `row` = standing / chip badge. */
  size?: 'face' | 'row';
}) {
  if (!roleId) return null;
  const label = protocolCouncilGuardianMarkLabel(roleId);
  return (
    <span
      className={`os-surface-row-badge protocol-council-guardian-mark protocol-council-guardian-mark--${size}`}
      title={label}
      aria-label={label}
    >
      {label}
    </span>
  );
}
