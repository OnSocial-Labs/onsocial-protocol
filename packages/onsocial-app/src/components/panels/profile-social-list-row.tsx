'use client';

import Link from 'next/link';
import { Divider, ProtocolMotionArrow } from '@onsocial/ui';
import { DiscoverMoodDot } from '@/components/moods/discover-mood-dot';
import { StandingRelationshipSignal } from '@/components/ui/standing-relationship-signal';
import { StandingToggle } from '@/components/ui/standing-toggle';
import { portfolioPath } from '@/lib/overlay-routes';
import type { ProfileListAccount } from '@/lib/profile-list-account';
import { isProfileListAccountDisplayReady } from '@/lib/profile-list-display';
import { standingTimeMeta } from '@/lib/standing-list-meta';
import { formatProfileCount } from '@/lib/profile-social-standings';

export type ProfileStandingTimeMode = 'always' | 'viewer-only' | 'never';

export type ProfileSocialListSkeletonRowVariant = 'standing' | 'discover';

function resolveStandingTimeMeta(
  account: ProfileListAccount,
  mode: ProfileStandingTimeMode
) {
  if (mode === 'never') return null;
  if (mode === 'viewer-only' && !account.viewerStanding) return null;
  return standingTimeMeta(account);
}

function accountLabel(account: ProfileListAccount): string {
  return account.name?.trim() || `@${account.accountId}`;
}

function AccountAvatar({ avatarUrl }: { avatarUrl: string | null }) {
  return (
    <div className="standing-row-avatar" aria-hidden>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="standing-row-avatar-img" />
      ) : (
        <span className="standing-row-avatar-fallback" />
      )}
    </div>
  );
}

function MetricCount({
  value,
  tone,
}: {
  value: number;
  tone: 'standing' | 'solidarity' | 'endorse';
}) {
  return (
    <span
      className={`standing-row-metric-value standing-row-metric-value--${tone}${
        value === 0 ? ' is-zero' : ''
      }`}
    >
      {formatProfileCount(value)}
    </span>
  );
}

function ProfileRowMetrics({ account }: { account: ProfileListAccount }) {
  return (
    <div className="standing-row-metrics">
      <span
        className="standing-row-metric"
        aria-label={`${formatProfileCount(account.standingCount)} stand with them`}
      >
        <ProtocolMotionArrow static className="standing-row-metric-arrow" />
        <MetricCount value={account.standingCount} tone="standing" />
      </span>
      <span
        className="standing-row-metric"
        aria-label={`They stand with ${formatProfileCount(account.standingWithCount)}`}
      >
        <MetricCount value={account.standingWithCount} tone="standing" />
        <ProtocolMotionArrow static className="standing-row-metric-arrow" />
      </span>
      <span className="standing-row-metric-sep" aria-hidden>
        ·
      </span>
      <span
        className="standing-row-metric"
        aria-label={`${formatProfileCount(account.mutualStandingCount)} solidarity connections`}
      >
        <ProtocolMotionArrow
          direction="in"
          static
          className="standing-row-metric-arrow standing-row-metric-arrow--solidarity"
        />
        <MetricCount value={account.mutualStandingCount} tone="solidarity" />
        <ProtocolMotionArrow
          static
          className="standing-row-metric-arrow standing-row-metric-arrow--solidarity"
        />
      </span>
      <span className="standing-row-metric-sep" aria-hidden>
        ·
      </span>
      <span
        className="standing-row-metric"
        aria-label={`${formatProfileCount(account.endorsementsReceivedCount)} endorsements received`}
      >
        <ProtocolMotionArrow
          static
          className="standing-row-metric-arrow standing-row-metric-arrow--endorse"
        />
        <MetricCount value={account.endorsementsReceivedCount} tone="endorse" />
      </span>
      <span
        className="standing-row-metric"
        aria-label={`${formatProfileCount(account.endorsementsGivenCount)} endorsements given`}
      >
        <MetricCount value={account.endorsementsGivenCount} tone="endorse" />
        <ProtocolMotionArrow
          static
          className="standing-row-metric-arrow standing-row-metric-arrow--endorse"
        />
      </span>
    </div>
  );
}

export function ProfileSocialListSkeletonRow({
  rowVariant = 'standing',
}: {
  rowVariant?: ProfileSocialListSkeletonRowVariant;
}) {
  const showTimeShimmer = rowVariant === 'standing';

  return (
    <div className="standing-row standing-row--skeleton" aria-hidden>
      <div className="standing-row-main">
        <div className="standing-row-avatar standing-row-shimmer" />
        <div className="standing-row-copy">
          <div className="standing-row-shimmer standing-row-shimmer-line" />
          <div className="standing-row-shimmer standing-row-shimmer-line-sm" />
          <div className="standing-row-shimmer standing-row-shimmer-line-bio" />
          <div className="standing-row-shimmer standing-row-shimmer-line-xs" />
        </div>
      </div>
      <div className="standing-row-aside standing-row-aside--skeleton">
        {showTimeShimmer ? (
          <div className="standing-row-shimmer standing-row-shimmer-time" />
        ) : null}
        <div className="standing-row-shimmer standing-row-shimmer-pill" />
      </div>
    </div>
  );
}

export function ProfileSocialListRow({
  account,
  showSolidarityBadge,
  standingTimeMode = 'always',
  viewerAccountId,
  canUpdateStanding,
  isPending,
  onUpdateStanding,
}: {
  account: ProfileListAccount;
  showSolidarityBadge?: boolean;
  standingTimeMode?: ProfileStandingTimeMode;
  viewerAccountId: string | null;
  canUpdateStanding?: boolean;
  isPending?: boolean;
  onUpdateStanding?: (shouldStand: boolean) => void;
}) {
  if (!isProfileListAccountDisplayReady(account)) {
    return <ProfileSocialListSkeletonRow rowVariant="standing" />;
  }

  const canShowViewerRelationship =
    Boolean(viewerAccountId) && viewerAccountId !== account.accountId;
  const viewerStandsWithAccount = Boolean(account.viewerStanding);
  const theyStandWithViewer =
    canShowViewerRelationship && Boolean(account.theyStandWithViewer);
  const sharedSolidarity =
    showSolidarityBadge && viewerStandsWithAccount && theyStandWithViewer;
  const showEndorsedYou =
    canShowViewerRelationship && Boolean(account.targetEndorsedViewer);
  const bio = account.bio?.trim();
  const timeMeta = resolveStandingTimeMeta(account, standingTimeMode);
  const showRelationshipSignals =
    sharedSolidarity || theyStandWithViewer || showEndorsedYou;
  const moodId = account.moodId ?? 'protocol';

  return (
    <div className="standing-row">
      <Link
        href={portfolioPath(account.accountId)}
        className="standing-row-main"
        scroll={false}
      >
        <AccountAvatar avatarUrl={account.avatarUrl} />
        <div className="standing-row-copy">
          {showRelationshipSignals ? (
            <div className="standing-row-signals">
              {sharedSolidarity ? (
                <StandingRelationshipSignal
                  label="Solidarity"
                  tone="solidarity"
                  title="You both stand with each other"
                />
              ) : theyStandWithViewer ? (
                <StandingRelationshipSignal
                  label="Stands with you"
                  tone="standing"
                  title="This account stands with you"
                />
              ) : null}
              {showEndorsedYou ? (
                <StandingRelationshipSignal
                  label="Endorsed you"
                  tone="endorse"
                  title="This account has endorsed you"
                />
              ) : null}
            </div>
          ) : null}
          <span className="standing-row-head">
            <span className="standing-row-name">{accountLabel(account)}</span>
            {moodId !== 'protocol' ? (
              <DiscoverMoodDot moodId={moodId} />
            ) : null}
          </span>
          <span className="standing-row-handle">@{account.accountId}</span>
          {bio ? <span className="standing-row-bio">{bio}</span> : null}
          <ProfileRowMetrics account={account} />
        </div>
      </Link>

      <div
        className={`standing-row-aside${
          !timeMeta && !(canUpdateStanding && onUpdateStanding) ? ' is-empty' : ''
        }`}
      >
        {timeMeta ? (
          <span
            className="standing-row-time"
            aria-label={timeMeta.description}
          >
            {timeMeta.label}
          </span>
        ) : null}
        {canUpdateStanding && onUpdateStanding ? (
          <button
            type="button"
            className={`standing-action group${viewerStandsWithAccount ? ' is-standing' : ''}`}
            disabled={isPending}
            onClick={() => onUpdateStanding(!viewerStandsWithAccount)}
            aria-label={
              viewerStandsWithAccount
                ? `Step back from ${accountLabel(account)}`
                : `Stand with ${accountLabel(account)}`
            }
          >
            <StandingToggle
              active={viewerStandsWithAccount}
              pending={isPending}
            />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ProfileSocialListSkeleton({
  count = 6,
  variant = 'full',
  rowVariant = 'standing',
}: {
  count?: number;
  variant?: 'full' | 'append';
  rowVariant?: ProfileSocialListSkeletonRowVariant;
}) {
  return (
    <div
      className={`standing-list standing-list-skeleton${
        variant === 'append' ? ' standing-list-skeleton--append' : ''
      }`}
      aria-hidden
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>
          {index > 0 || variant === 'append' ? (
            <Divider variant="item" />
          ) : null}
          <ProfileSocialListSkeletonRow rowVariant={rowVariant} />
        </div>
      ))}
    </div>
  );
}
