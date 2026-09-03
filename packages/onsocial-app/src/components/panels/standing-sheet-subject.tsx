'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { AccountAvatar } from '@/components/profile/account-avatar';
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
      <AccountAvatar size="md" shellLoading />
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
  const {
    accountId,
    displayName,
    avatarUrl,
    profileKind,
    isDaoSubject,
    isSelf,
    showSubjectSkeleton,
  } = useStandingPanel();
  const label = isSelf ? 'You' : displayName;

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
      >
        <SubjectAvatar
          accountId={accountId}
          avatarUrl={avatarUrl}
          kind={profileKind}
          isDao={isDaoSubject}
        />
        <span className="standing-sheet-subject-copy">
          <span className="standing-sheet-subject-name">{label}</span>
        </span>
      </Link>
      {trailing}
    </div>
  );
}
