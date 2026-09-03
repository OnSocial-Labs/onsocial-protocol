'use client';

import Link from 'next/link';
import {
  Divider,
  RepeatIcon,
  standingIdentityLabel,
} from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import type { ReactNode } from 'react';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import type { PostRelationContext } from '@/lib/post-relation';
import {
  formatLauncherRelationTarget,
  launcherRelationLead,
} from '@/lib/launcher-post-peek';

export function LauncherPeekList({
  children,
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  'aria-label': string;
}) {
  return (
    <ul className="launcher-peek-list" aria-label={ariaLabel}>
      {children}
    </ul>
  );
}

export function LauncherPeekRow({
  href,
  title,
  meta,
}: {
  href: string;
  title: string;
  meta: ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="launcher-peek-row" scroll={false}>
        <span className="launcher-peek-row-copy">
          <span className="launcher-peek-row-title">{title}</span>
          <span className="launcher-peek-row-meta">{meta}</span>
        </span>
      </Link>
    </li>
  );
}

function LauncherPeekRelation({
  relation,
  targetProfileName,
}: {
  relation: PostRelationContext;
  targetProfileName?: string | null;
}) {
  if (relation.kind === 'repost') {
    return (
      <span className="launcher-home-peek-relation">
        <RepeatIcon className="launcher-home-peek-relation-icon" aria-hidden />
        {relation.label}
      </span>
    );
  }

  const target = formatLauncherRelationTarget(relation.handle, targetProfileName);

  return (
    <span className="launcher-home-peek-relation">
      {relation.verb}{' '}
      {target.name ? (
        <>
          <span className="launcher-home-peek-relation-name">{target.name}</span>{' '}
          <span className="launcher-home-peek-relation-handle">
            @{target.handle}
          </span>
        </>
      ) : (
        <span className="launcher-home-peek-relation-handle">@{target.handle}</span>
      )}
    </span>
  );
}

function LauncherSocialPeekSkeletonRow() {
  return (
    <div
      className="standing-row standing-row--skeleton launcher-home-peek-row"
      aria-hidden
    >
      <div className="standing-row-main">
        <div className="standing-row-avatar standing-row-shimmer" />
        <div className="standing-row-copy">
          <div className="standing-row-shimmer standing-row-shimmer-line" />
          <div className="standing-row-shimmer standing-row-shimmer-line-sm" />
          <div className="standing-row-shimmer standing-row-shimmer-line-bio" />
        </div>
      </div>
      <div className="standing-row-aside">
        <div className="standing-row-shimmer standing-row-shimmer-time" />
      </div>
    </div>
  );
}

/** Layout-accurate shimmer while launcher social peeks load. */
export function LauncherSocialPeekSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div
      className="standing-list launcher-home-peeks standing-list-skeleton"
      aria-busy="true"
      aria-label="Loading latest"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>
          {index > 0 ? <Divider variant="item" /> : null}
          <LauncherSocialPeekSkeletonRow />
        </div>
      ))}
    </div>
  );
}

export function LauncherSocialPeekList({
  children,
  'aria-label': ariaLabel,
  footer,
}: {
  children: ReactNode;
  'aria-label': string;
  footer?: ReactNode;
}) {
  return (
    <div className="standing-list launcher-home-peeks" aria-label={ariaLabel}>
      {children}
      {footer}
    </div>
  );
}

export function LauncherSocialPeekRow({
  href,
  accountId,
  profileName,
  avatarUrl,
  contextLabel,
  timeLabel,
  timeTitle,
  excerpt,
  relation,
  repostAttribution,
  relationTargetProfileName,
  showDivider = false,
}: {
  href: string;
  accountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  contextLabel: string;
  timeLabel: string | null;
  timeTitle?: string | null;
  excerpt: string;
  relation?: PostRelationContext | null;
  repostAttribution?: string | null;
  relationTargetProfileName?: string | null;
  showDivider?: boolean;
}) {
  const { label } = standingIdentityLabel(accountId, profileName);
  const relationLead = launcherRelationLead({
    relation,
    repostAttribution,
    relationTargetProfileName,
  });
  const ariaLabel = [relationLead, label, contextLabel, excerpt, timeLabel]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      {showDivider ? <Divider variant="item" /> : null}
      <div className="standing-row launcher-home-peek-row">
        <div className="standing-row-main">
          <Link
            href={href}
            className="standing-row-hit"
            scroll={false}
            aria-label={ariaLabel}
          />
          <StandingIdentity
            accountId={accountId}
            profileName={profileName}
            avatarUrl={avatarUrl}
            size="sm"
            showHandle={false}
            nameTrailing={<ProtocolNameTrailing accountId={accountId} />}
            copyLeading={
              repostAttribution ? (
                <span className="launcher-home-peek-relation">
                  <RepeatIcon
                    className="launcher-home-peek-relation-icon"
                    aria-hidden
                  />
                  {repostAttribution}
                </span>
              ) : relation ? (
                <LauncherPeekRelation
                  relation={relation}
                  targetProfileName={relationTargetProfileName}
                />
              ) : null
            }
          >
            <span className="launcher-home-peek-context">{contextLabel}</span>
            <span className="launcher-home-peek-excerpt">{excerpt}</span>
          </StandingIdentity>
        </div>
        {timeLabel ? (
          <div className="standing-row-aside">
            <span className="standing-row-time" title={timeTitle ?? undefined}>
              {timeLabel}
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
}
