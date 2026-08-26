'use client';

import Link from 'next/link';
import { Divider, ProtocolMotionArrow } from '@onsocial/ui';
import {
  StandingIdentity,
  standingIdentityLabel,
} from '@onsocial/ui';
import { StandingRelationshipSignal } from '@/components/ui/standing-relationship-signal';
import { StandingToggle } from '@/components/ui/standing-toggle';
import { PostRichText } from '@/features/home/post-rich-text';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import { portfolioPath } from '@/lib/overlay-routes';
import { daoPath } from '@/lib/app-routes';
import { isDaoStandingTarget } from '@/lib/dao-standing-account';
import type { ProfileListAccount } from '@/lib/profile-list-account';
import { isProfileListAccountDisplayReady } from '@/lib/profile-list-display';
import { standingTimeMeta } from '@/lib/standing-list-meta';
import { formatProfileCount } from '@/lib/profile-social-standings';

export type ProfileStandingTimeMode = 'always' | 'viewer-only' | 'never';

export type ProfileSocialListSkeletonRowVariant =
  | 'standing'
  | 'discover'
  | 'guild-member'
  | 'leaderboard';

function resolveStandingTimeMeta(
  account: ProfileListAccount,
  mode: ProfileStandingTimeMode
) {
  if (mode === 'never') return null;
  if (mode === 'viewer-only' && !account.viewerStanding) return null;
  return standingTimeMeta(account);
}

function accountLabel(account: ProfileListAccount): string {
  return standingIdentityLabel(account.accountId, account.name).label;
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

function ProfileRowMetrics({
  account,
  isDao = false,
}: {
  account: ProfileListAccount;
  isDao?: boolean;
}) {
  if (isDao) {
    return (
      <div className="standing-row-metrics">
        <span
          className="standing-row-metric"
          aria-label={`${formatProfileCount(account.standingCount)} stand with them`}
        >
          <ProtocolMotionArrow static className="standing-row-metric-arrow" />
          <MetricCount value={account.standingCount} tone="standing" />
        </span>
      </div>
    );
  }

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
  const showTimeShimmer =
    rowVariant === 'standing' || rowVariant === 'guild-member';
  const isGuildMember = rowVariant === 'guild-member';
  const isLeaderboard = rowVariant === 'leaderboard';

  if (isLeaderboard) {
    return (
      <div
        className="standing-row leaderboard-row leaderboard-row--skeleton standing-row--skeleton"
        aria-hidden
      >
        <div className="standing-row-main">
          <div className="leaderboard-row-rank" aria-hidden>
            <div className="standing-row-shimmer leaderboard-row-shimmer-rank" />
            <div className="standing-row-shimmer leaderboard-row-shimmer-rank-dense" />
          </div>
          <div className="standing-row-avatar standing-row-shimmer" />
          <div className="standing-row-copy">
            <div className="standing-row-shimmer standing-row-shimmer-line leaderboard-row-shimmer-name" />
            <div className="standing-row-shimmer standing-row-shimmer-line-bio leaderboard-row-shimmer-meta" />
          </div>
        </div>
        <div className="standing-row-aside leaderboard-row-aside">
          <div className="leaderboard-row-value">
            <div className="standing-row-shimmer leaderboard-row-shimmer-primary" />
            <div className="standing-row-shimmer leaderboard-row-shimmer-unit" />
          </div>
        </div>
      </div>
    );
  }

  if (isGuildMember) {
    return (
      <div
        className="standing-row guild-member-row guild-member-row--skeleton"
        aria-hidden
      >
        <div className="standing-row-main">
          <div className="standing-row-shimmer standing-row-avatar" />
          <div className="standing-row-copy">
            <span className="standing-row-head">
              <span className="standing-row-name-row guild-member-row-name-row">
                <div className="standing-row-shimmer standing-row-shimmer-line" />
                <div className="standing-row-shimmer standing-row-shimmer-pill guild-member-row-badge-shimmer" />
              </span>
              <div className="standing-row-shimmer standing-row-shimmer-line-sm" />
            </span>
          </div>
        </div>
        <div className="standing-row-aside guild-member-row-aside">
          <div className="standing-row-shimmer standing-row-shimmer-time" />
          <div className="standing-row-shimmer standing-row-shimmer-pill guild-member-row-menu-shimmer" />
        </div>
      </div>
    );
  }

  return (
    <div className="standing-row standing-row--skeleton" aria-hidden>
      <div className="standing-row-main">
        <div className="standing-row-avatar standing-row-shimmer" />
        <div className="standing-row-copy">
          <div className="standing-row-name-row">
            <div className="standing-row-shimmer standing-row-shimmer-line" />
            {showTimeShimmer ? (
              <div className="standing-row-shimmer standing-row-shimmer-time" />
            ) : null}
          </div>
          <div className="standing-row-shimmer standing-row-shimmer-line-sm" />
          <>
            <div className="standing-row-shimmer standing-row-shimmer-line-bio" />
            <div className="standing-row-shimmer standing-row-shimmer-line-xs" />
          </>
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
  viewerRelationshipLoading,
  onUpdateStanding,
}: {
  account: ProfileListAccount;
  showSolidarityBadge?: boolean;
  standingTimeMode?: ProfileStandingTimeMode;
  viewerAccountId: string | null;
  canUpdateStanding?: boolean;
  isPending?: boolean;
  viewerRelationshipLoading?: boolean;
  onUpdateStanding?: (shouldStand: boolean) => void;
}) {
  if (!isProfileListAccountDisplayReady(account)) {
    return <ProfileSocialListSkeletonRow rowVariant="standing" />;
  }

  const canShowViewerRelationship =
    Boolean(viewerAccountId) && viewerAccountId !== account.accountId;
  const isResolvingViewerRelationship = Boolean(
    canUpdateStanding &&
      onUpdateStanding &&
      viewerRelationshipLoading &&
      !isPending
  );
  const relationshipKnown =
    canShowViewerRelationship && !isResolvingViewerRelationship;
  const viewerStandsWithAccount =
    relationshipKnown && Boolean(account.viewerStanding);
  const theyStandWithViewer =
    relationshipKnown && Boolean(account.theyStandWithViewer);
  const sharedSolidarity =
    showSolidarityBadge && viewerStandsWithAccount && theyStandWithViewer;
  const showEndorsedYou =
    relationshipKnown && Boolean(account.targetEndorsedViewer);
  const bio = account.bio?.trim();
  const timeMeta = isResolvingViewerRelationship
    ? null
    : resolveStandingTimeMeta(account, standingTimeMode);
  const showRelationshipSignals =
    sharedSolidarity || theyStandWithViewer || showEndorsedYou;
  const moodId = account.moodId ?? 'protocol';
  const isDaoTarget = isDaoStandingTarget(account.accountId, account.isDao);
  const targetHref = isDaoTarget
    ? daoPath(account.accountId)
    : portfolioPath(account.accountId);
  const targetAriaLabel = isDaoTarget
    ? `View ${accountLabel(account)} DAO`
    : `View ${accountLabel(account)}'s profile`;

  return (
    <div className={`standing-row${isDaoTarget ? ' standing-row--dao' : ''}`}>
      <div className="standing-row-main">
        <Link
          href={targetHref}
          className="standing-row-hit"
          scroll={false}
          aria-label={targetAriaLabel}
        />
        <StandingIdentity
          accountId={account.accountId}
          profileName={account.name}
          avatarUrl={account.avatarUrl}
          avatarClassName={
            isDaoTarget
              ? 'standing-row-avatar-slot dao-directory-crest'
              : 'standing-row-avatar-slot'
          }
          copyLeading={
            showRelationshipSignals ? (
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
            ) : null
          }
          nameTrailing={
            <ProtocolNameTrailing
              accountId={account.accountId}
              isDao={isDaoTarget}
              moodId={moodId}
            />
          }
        >
          {bio ? (
            <span className="standing-row-bio">
              <PostRichText text={bio} emptyFallback="" showLinkIcon />
            </span>
          ) : null}
          <ProfileRowMetrics account={account} isDao={isDaoTarget} />
        </StandingIdentity>
      </div>

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
        {isResolvingViewerRelationship ? (
          <span
            className="standing-row-shimmer standing-row-shimmer-pill"
            aria-hidden
          />
        ) : canUpdateStanding && onUpdateStanding ? (
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
  const isLeaderboard = rowVariant === 'leaderboard';

  return (
    <div
      className={`standing-list${isLeaderboard ? ' leaderboard-list' : ''} standing-list-skeleton${
        variant === 'append' ? ' standing-list-skeleton--append' : ''
      }`}
      aria-hidden
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>
          {!isLeaderboard && (index > 0 || variant === 'append') ? (
            <Divider variant="item" />
          ) : null}
          <ProfileSocialListSkeletonRow rowVariant={rowVariant} />
        </div>
      ))}
    </div>
  );
}
