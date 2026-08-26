'use client';

import {
  ProtocolGovernanceMemberMark,
  ProtocolProposerMark,
  ProtocolTreasuryMemberMark,
} from '@/features/protocol/protocol-identity-mark-button';
import type { ProtocolDaoMemberships } from '@/lib/protocol-dao-memberships';

/**
 * Soft-fill cluster: membership marks (gov + treasury) plus proposer recognition.
 * Size follows the name row via `em`.
 */
export function ProtocolMembershipMarks({
  memberships,
}: {
  memberships: ProtocolDaoMemberships | null | undefined;
}) {
  if (!memberships) return null;
  const { governance, treasury, proposer } = memberships;
  if (!governance && !treasury && !proposer.governance && !proposer.treasury) {
    return null;
  }

  return (
    <span className="protocol-identity-mark-cluster">
      {governance ? (
        <ProtocolGovernanceMemberMark roleId={governance} />
      ) : null}
      {treasury ? <ProtocolTreasuryMemberMark roleId={treasury} /> : null}
      <ProtocolProposerMark proposer={proposer} />
    </span>
  );
}
