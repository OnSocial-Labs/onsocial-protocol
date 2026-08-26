'use client';

import type { ReactNode } from 'react';
import type { PageMoodId } from '@onsocial/sdk';
import { DiscoverMoodDot } from '@/components/moods/discover-mood-dot';
import { ProtocolFaceDaoMark } from '@/features/protocol/protocol-face-dao-mark';
import { ProtocolMembershipMarks } from '@/features/protocol/protocol-membership-marks';
import { useProtocolDaoMemberships } from '@/hooks/use-protocol-dao-memberships';
import { resolveProtocolFaceDaoKind } from '@/lib/portfolio-dao-entity';

/**
 * Universal name-trailing protocol chrome: face mark for Gov/Treasury DAOs,
 * soft-fill gov+treasury membership marks for people, optional mood / extras.
 * Glyph size follows the name row font via `em`.
 */
export function ProtocolNameTrailing({
  accountId,
  isDao,
  moodId = null,
  softFill = true,
  extra = null,
}: {
  accountId: string;
  /** When known (standing lists). Otherwise inferred for protocol face pair. */
  isDao?: boolean;
  moodId?: PageMoodId | null;
  /** Soft-fill membership marks for people (default true). */
  softFill?: boolean;
  /** Extra trailing chrome (guild role, topic, …) after protocol marks. */
  extra?: ReactNode;
}) {
  const faceKind = resolveProtocolFaceDaoKind(accountId);
  // Only suppress soft-fill when the caller marks this face as a DAO org.
  // Local heuristics must not hide membership marks on people.
  const softFillMembership = softFill && !faceKind && isDao !== true;
  const memberships = useProtocolDaoMemberships(
    accountId,
    softFillMembership
  );
  const showMood = Boolean(moodId && moodId !== 'protocol');

  return (
    <>
      {faceKind ? <ProtocolFaceDaoMark accountId={accountId} /> : null}
      {softFillMembership ? (
        <ProtocolMembershipMarks memberships={memberships} />
      ) : null}
      {showMood && moodId ? <DiscoverMoodDot moodId={moodId} /> : null}
      {extra}
    </>
  );
}
