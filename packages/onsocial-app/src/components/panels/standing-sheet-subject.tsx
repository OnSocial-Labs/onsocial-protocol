'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { portfolioPath } from '@/lib/overlay-routes';
import { useStandingPanel } from '@/components/panels/standing-panel-context';

function SubjectAvatar({ avatarUrl }: { avatarUrl: string | null }) {
  return (
    <span className="standing-sheet-subject-avatar" aria-hidden>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="standing-sheet-subject-avatar-img"
        />
      ) : (
        <span className="standing-sheet-subject-avatar-fallback" />
      )}
    </span>
  );
}

function SubjectSkeletonBody() {
  return (
    <div className="standing-sheet-subject standing-sheet-subject--skeleton">
      <span className="standing-sheet-subject-avatar standing-row-shimmer" />
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
  const { accountId, displayName, avatarUrl, isSelf, showSubjectSkeleton } =
    useStandingPanel();
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
        <SubjectAvatar avatarUrl={avatarUrl} />
        <span className="standing-sheet-subject-copy">
          <span className="standing-sheet-subject-name">{label}</span>
        </span>
      </Link>
      {trailing}
    </div>
  );
}
