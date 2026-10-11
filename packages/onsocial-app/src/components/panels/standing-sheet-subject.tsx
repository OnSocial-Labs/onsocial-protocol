'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { AccountAvatar } from '@/components/profile/account-avatar';
import {
  clearNetworkStandingHandoff,
  clearStandingSheetCovered,
} from '@/components/panels/network-standing-handoff';
import { portfolioPath } from '@/lib/overlay-routes';
import { useStandingPanel } from '@/components/panels/standing-panel-context';
import type { ProfileKind } from '@onsocial/sdk';

function SubjectAvatar({
  accountId,
  avatarUrl,
  fallbackInitial,
  kind,
  isDao,
  shellLoading = false,
}: {
  accountId?: string | null;
  avatarUrl: string | null;
  fallbackInitial?: string;
  kind?: ProfileKind | null;
  isDao?: boolean;
  shellLoading?: boolean;
}) {
  return (
    <AccountAvatar
      accountId={accountId}
      kind={kind}
      isDao={isDao}
      src={avatarUrl}
      fallbackInitial={fallbackInitial}
      shellLoading={shellLoading}
      size="md"
    />
  );
}

export function StandingSheetSubjectAvatar({
  avatarUrl,
  fallbackInitial,
  shellLoading = false,
}: {
  avatarUrl: string | null;
  fallbackInitial?: string;
  shellLoading?: boolean;
}) {
  return (
    <SubjectAvatar
      avatarUrl={avatarUrl}
      fallbackInitial={fallbackInitial}
      shellLoading={shellLoading}
    />
  );
}

function SubjectSkeletonBody() {
  return (
    <div className="standing-sheet-subject standing-sheet-subject--skeleton">
      <span className="standing-sheet-subject-copy">
        <span className="standing-row-shimmer standing-row-shimmer-line standing-sheet-subject-shimmer-name" />
      </span>
    </div>
  );
}

export function StandingSheetSubjectSkeleton({
  leading,
  trailing,
}: {
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div
      className="standing-sheet-subject-row standing-sheet-subject-row--skeleton"
      aria-hidden
    >
      {leading}
      <SubjectSkeletonBody />
      {trailing}
    </div>
  );
}

export function StandingSheetSubject({
  leading,
  trailing,
}: {
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const { accountId, displayName, showSubjectSkeleton } = useStandingPanel();
  const label = displayName.trim() || accountId;

  if (showSubjectSkeleton) {
    return (
      <StandingSheetSubjectSkeleton leading={leading} trailing={trailing} />
    );
  }

  return (
    <div className="standing-sheet-subject-row">
      {leading}
      <Link
        href={portfolioPath(accountId)}
        className="standing-sheet-subject"
        aria-label={`${label} portfolio`}
        onClick={() => {
          // A map handoff treats arrival on this profile as "now open the
          // list". The name is that profile, so the list must not come back.
          clearNetworkStandingHandoff();
          clearStandingSheetCovered();
        }}
      >
        <span className="standing-sheet-subject-copy">
          <span className="standing-sheet-subject-name">{label}</span>
        </span>
      </Link>
      {trailing}
    </div>
  );
}
