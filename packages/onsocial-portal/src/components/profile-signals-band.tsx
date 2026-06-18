'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { HeartHandshake } from 'lucide-react';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import type { ReputationEntry } from '@/lib/leaderboard';
import { formatReputation } from '@/lib/leaderboard';
import type { PortalEndorsementsMode } from '@/lib/portal-config';
import { graphRoutePrefetchProps } from '@/lib/profile-graph-link';
import type { StanceDetailKind } from '@/lib/profile-social-standings';
import { cn } from '@/lib/utils';

export interface ProfileSignalsSocialCounts {
  counts: {
    incoming: number;
    outgoing: number;
    mutual: number;
  };
  viewerStanding?: boolean;
  theyStandWithViewer?: boolean;
}

const metricBtnClass =
  'group inline-flex items-center rounded px-0.5 py-px transition-colors focus-visible:outline-none focus-visible:ring-1';

const metricsRowClass =
  'flex min-w-0 flex-wrap items-center gap-x-0.5 gap-y-0.5 portal-type-body-sm';

const groupSeparatorClass =
  'select-none px-0.5 text-muted-foreground/25 portal-type-body-sm';

const metricSeparatorClass =
  'select-none text-muted-foreground/30 portal-type-body-sm';

const metricInnerClass = 'inline-flex items-center gap-0.5';

function formatCount(count: number): string {
  const numericCount = Number(count);
  if (!Number.isFinite(numericCount)) return '0';

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits:
      Math.abs(numericCount) >= 1000 && Math.abs(numericCount) < 100000 ? 1 : 0,
    notation: Math.abs(numericCount) >= 1000 ? 'compact' : 'standard',
  }).format(numericCount);
}

function toFiniteNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function ProfileSignalsBand({
  social,
  endorsementCount,
  givenEndorsementCount,
  supportedEndorsementCount = 0,
  reputation,
  isSelf,
  viewerHasEndorsed = false,
  showEndorsementMetrics = false,
  footer,
  onOpenStanceDetail,
  onOpenEndorsements,
  prefetchStandDetail,
  prefetchEndorsementsPage,
}: {
  social: ProfileSignalsSocialCounts;
  endorsementCount: number;
  givenEndorsementCount: number;
  supportedEndorsementCount?: number;
  reputation: ReputationEntry | null;
  isSelf: boolean;
  viewerHasEndorsed?: boolean;
  showEndorsementMetrics?: boolean;
  footer?: ReactNode;
  onOpenStanceDetail: (kind: StanceDetailKind) => void;
  onOpenEndorsements: (mode: PortalEndorsementsMode, topic?: string) => void;
  prefetchStandDetail?: (kind: StanceDetailKind) => void;
  prefetchEndorsementsPage?: (mode: PortalEndorsementsMode) => void;
}) {
  const incomingCount = social.counts.incoming;
  const outgoingCount = social.counts.outgoing;
  const mutualCount = social.counts.mutual;
  const viewerStanding = Boolean(social.viewerStanding);
  const theyStandWithViewer = Boolean(!isSelf && social.theyStandWithViewer);
  const sharedSolidarity = viewerStanding && theyStandWithViewer;
  const rank = reputation ? toFiniteNumber(reputation.rank) : 0;
  const repValue = reputation ? toFiniteNumber(reputation.reputation) : null;

  const standingMetrics = (
    <>
      <button
        type="button"
        onClick={() => onOpenStanceDetail('incoming')}
        {...graphRoutePrefetchProps(() => prefetchStandDetail?.('incoming'))}
        className={cn(
          metricBtnClass,
          'focus-visible:ring-[var(--portal-blue-focus-border)]',
          theyStandWithViewer &&
            !sharedSolidarity &&
            'bg-[var(--portal-blue-bg)]/90'
        )}
        aria-label={
          isSelf
            ? `${formatCount(incomingCount)} stand with you`
            : theyStandWithViewer
              ? `${formatCount(incomingCount)} stand with them, including you`
              : `${formatCount(incomingCount)} stand with them`
        }
      >
        <span className={metricInnerClass}>
          <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-blue)]" />
          <span
            className={cn(
              'font-bold tabular-nums text-[var(--portal-blue)]',
              incomingCount === 0 && 'opacity-40'
            )}
          >
            {formatCount(incomingCount)}
          </span>
        </span>
      </button>
      <span aria-hidden="true" className={metricSeparatorClass}>
        ·
      </span>
      <button
        type="button"
        onClick={() => onOpenStanceDetail('outgoing')}
        {...graphRoutePrefetchProps(() => prefetchStandDetail?.('outgoing'))}
        className={cn(
          metricBtnClass,
          'focus-visible:ring-[var(--portal-blue-focus-border)]'
        )}
        aria-label={
          isSelf
            ? `You stand with ${formatCount(outgoingCount)}`
            : `They stand with ${formatCount(outgoingCount)}`
        }
      >
        <span className={metricInnerClass}>
          <span
            className={cn(
              'font-bold tabular-nums text-[var(--portal-blue)]',
              outgoingCount === 0 && 'opacity-40'
            )}
          >
            {formatCount(outgoingCount)}
          </span>
          <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-blue)]" />
        </span>
      </button>
      <span aria-hidden="true" className={metricSeparatorClass}>
        ·
      </span>
      <button
        type="button"
        onClick={() => onOpenStanceDetail('mutual')}
        {...graphRoutePrefetchProps(() => prefetchStandDetail?.('mutual'))}
        className={cn(
          metricBtnClass,
          'focus-visible:ring-[var(--portal-purple-border)]',
          sharedSolidarity && 'bg-[var(--portal-purple-bg)]/90'
        )}
        aria-label={
          sharedSolidarity
            ? `You stand with each other (${formatCount(mutualCount)} solidarity in their network)`
            : isSelf
              ? `${formatCount(mutualCount)} solidarity connections`
              : `${formatCount(mutualCount)} solidarity connections in their network`
        }
      >
        <span className={metricInnerClass}>
          <ProtocolMotionArrow
            direction="in"
            className="h-2.5 w-2.5 text-[var(--portal-purple)]"
          />
          <span
            className={cn(
              'font-bold tabular-nums text-[var(--portal-purple)]',
              mutualCount === 0 && 'opacity-40'
            )}
          >
            {formatCount(mutualCount)}
          </span>
          <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-purple)]" />
        </span>
      </button>
    </>
  );

  const endorsementMetrics = (
    <>
      <button
        type="button"
        onClick={() => onOpenEndorsements('received')}
        {...graphRoutePrefetchProps(() =>
          prefetchEndorsementsPage?.('received')
        )}
        className={cn(
          metricBtnClass,
          'focus-visible:ring-[var(--portal-gold-accent)]',
          !isSelf && viewerHasEndorsed && 'bg-[var(--portal-gold-bg)]/90'
        )}
        aria-label={
          !isSelf && viewerHasEndorsed
            ? `${formatCount(endorsementCount)} endorsements received, including yours`
            : `${formatCount(endorsementCount)} endorsements received`
        }
      >
        <span className={metricInnerClass}>
          <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-gold)]" />
          <span
            className={cn(
              'font-bold tabular-nums text-[var(--portal-gold)]',
              endorsementCount === 0 && 'opacity-40'
            )}
          >
            {formatCount(endorsementCount)}
          </span>
        </span>
      </button>
      <span aria-hidden="true" className={metricSeparatorClass}>
        ·
      </span>
      <button
        type="button"
        onClick={() => onOpenEndorsements('given')}
        {...graphRoutePrefetchProps(() => prefetchEndorsementsPage?.('given'))}
        className={cn(
          metricBtnClass,
          'focus-visible:ring-[var(--portal-gold-accent)]'
        )}
        aria-label={`${formatCount(givenEndorsementCount)} endorsements given`}
      >
        <span className={metricInnerClass}>
          <span
            className={cn(
              'font-bold tabular-nums text-[var(--portal-gold)]',
              givenEndorsementCount === 0 && 'opacity-40'
            )}
          >
            {formatCount(givenEndorsementCount)}
          </span>
          <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-gold)]" />
        </span>
      </button>
      {isSelf ? (
        <>
          <span aria-hidden="true" className={metricSeparatorClass}>
            ·
          </span>
          <button
            type="button"
            onClick={() => onOpenEndorsements('supported')}
            {...graphRoutePrefetchProps(() =>
              prefetchEndorsementsPage?.('supported')
            )}
            className={cn(
              metricBtnClass,
              'focus-visible:ring-[var(--portal-gold-accent)]'
            )}
            aria-label={`${formatCount(supportedEndorsementCount)} endorsements supported with SOCIAL`}
          >
            <span className={metricInnerClass}>
              <HeartHandshake className="h-2.5 w-2.5 text-[var(--portal-gold)]" />
              <span
                className={cn(
                  'font-bold tabular-nums text-[var(--portal-gold)]',
                  supportedEndorsementCount === 0 && 'opacity-40'
                )}
              >
                {formatCount(supportedEndorsementCount)}
              </span>
              <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-gold)]" />
            </span>
          </button>
        </>
      ) : null}
    </>
  );

  const reputationMetric =
    reputation && repValue !== null ? (
      <Link
        href="/boost/leaderboard"
        className={cn(
          metricBtnClass,
          'focus-visible:ring-[var(--portal-green-border)]'
        )}
        aria-label={`Protocol reputation ${formatReputation(reputation.reputation)}${rank > 0 ? `, rank ${formatCount(rank)}` : ''}`}
      >
        <span className={metricInnerClass}>
          <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-green)]" />
          <span
            className={cn(
              'font-bold tabular-nums text-[var(--portal-green)]',
              repValue === 0 && 'opacity-40'
            )}
          >
            {formatReputation(reputation.reputation)}
          </span>
        </span>
      </Link>
    ) : null;

  const captionParts: string[] = ['standing · solidarity'];
  if (showEndorsementMetrics) captionParts.push('endorsements');
  if (reputation) captionParts.push('reputation');

  return (
    <div className="space-y-1">
      <div className={metricsRowClass}>
        {standingMetrics}
        {showEndorsementMetrics ? (
          <>
            <span aria-hidden="true" className={groupSeparatorClass}>
              ·
            </span>
            {endorsementMetrics}
          </>
        ) : null}
        {reputationMetric ? (
          <>
            <span aria-hidden="true" className={groupSeparatorClass}>
              ·
            </span>
            {reputationMetric}
          </>
        ) : null}
      </div>

      <p className="portal-type-label text-muted-foreground/45">
        {captionParts.join(' · ')}
        {reputation && rank > 0 ? (
          <span className="tabular-nums text-muted-foreground/40">
            {' '}
            #{formatCount(rank)}
          </span>
        ) : null}
      </p>

      {footer ? <div className="pt-1">{footer}</div> : null}
    </div>
  );
}
