import Link from 'next/link';
import type { ReactNode } from 'react';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { standingPath } from '@/lib/profile-social-standings';
import { formatCount } from '@/lib/profile-display';
import type { ProfileSignals } from '@/lib/profile-signals';

interface PortfolioSignalsProps {
  accountId: string;
  signals: ProfileSignals;
  /** Viewer stands with this page owner. */
  viewerStanding?: boolean;
  /** Page owner stands with viewer. */
  theyStandWithViewer?: boolean;
}

const metricInnerClass = 'signal-metric-inner';
const arrowClass = 'signal-metric-arrow';

function formatReputation(value: number): string {
  if (value >= 1000) {
    return formatCount(Math.round(value));
  }
  return value.toFixed(value >= 100 ? 0 : 1);
}

function signalValueClass(value: number): string {
  return value === 0 ? 'signal-value is-zero' : 'signal-value';
}

const metricBaseClass = 'signal-metric group';

function metricClassName(options?: {
  highlight?: boolean;
  solidarity?: boolean;
  readonly?: boolean;
}): string {
  let className = metricBaseClass;
  if (options?.solidarity) className += ' signal-metric-solidarity';
  if (options?.highlight) className += ' signal-metric--highlight';
  if (options?.solidarity && options?.highlight) {
    className += ' signal-metric--solidarity-active';
  }
  if (options?.readonly) {
    className += ' signal-metric-readonly';
  }
  return className;
}

function SignalMetric({
  children,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  className: string;
  ariaLabel: string;
}) {
  return (
    <span className={className} aria-label={ariaLabel}>
      {children}
    </span>
  );
}

export function PortfolioSignals({
  accountId,
  signals,
  viewerStanding = false,
  theyStandWithViewer = false,
}: PortfolioSignalsProps) {
  const sharedSolidarity = viewerStanding && theyStandWithViewer;

  return (
    <div className="portfolio-signals" aria-label="Profile signals">
      <div className="signal-group signal-group-standing">
        <Link
          className={metricClassName({
            highlight: theyStandWithViewer && !sharedSolidarity,
          })}
          href={standingPath(accountId, 'incoming')}
          scroll={false}
          aria-label={`${signals.standingCount} stand with them`}
        >
          <span className={metricInnerClass}>
            <ProtocolMotionArrow className={arrowClass} />
            <span className={signalValueClass(signals.standingCount)}>
              {formatCount(signals.standingCount)}
            </span>
          </span>
        </Link>
        <span className="signal-dot" aria-hidden>
          ·
        </span>
        <Link
          className={metricClassName()}
          href={standingPath(accountId, 'outgoing')}
          scroll={false}
          aria-label={`they stand with ${signals.standingWithCount}`}
        >
          <span className={metricInnerClass}>
            <span className={signalValueClass(signals.standingWithCount)}>
              {formatCount(signals.standingWithCount)}
            </span>
            <ProtocolMotionArrow className={arrowClass} />
          </span>
        </Link>
        <span className="signal-dot" aria-hidden>
          ·
        </span>
        <Link
          className={metricClassName({
            solidarity: true,
            highlight: sharedSolidarity,
          })}
          href={standingPath(accountId, 'mutual')}
          scroll={false}
          aria-label={`${signals.mutualStandingCount} solidarity`}
        >
          <span className={metricInnerClass}>
            <ProtocolMotionArrow direction="in" className={arrowClass} />
            <span className={signalValueClass(signals.mutualStandingCount)}>
              {formatCount(signals.mutualStandingCount)}
            </span>
            <ProtocolMotionArrow className={arrowClass} />
          </span>
        </Link>
      </div>

      <span className="signal-sep" aria-hidden>
        ·
      </span>

      <div className="signal-group signal-group-endorse">
        <SignalMetric
          className={metricClassName({ readonly: true })}
          ariaLabel={`${signals.endorsementsReceivedCount} endorsements received`}
        >
          <span className={metricInnerClass}>
            <ProtocolMotionArrow className={arrowClass} />
            <span className={signalValueClass(signals.endorsementsReceivedCount)}>
              {formatCount(signals.endorsementsReceivedCount)}
            </span>
          </span>
        </SignalMetric>
        <span className="signal-dot" aria-hidden>
          ·
        </span>
        <SignalMetric
          className={metricClassName({ readonly: true })}
          ariaLabel={`${signals.endorsementsGivenCount} endorsements given`}
        >
          <span className={metricInnerClass}>
            <span className={signalValueClass(signals.endorsementsGivenCount)}>
              {formatCount(signals.endorsementsGivenCount)}
            </span>
            <ProtocolMotionArrow className={arrowClass} />
          </span>
        </SignalMetric>
      </div>

      {signals.reputation ? (
        <>
          <span className="signal-sep" aria-hidden>
            ·
          </span>
          <div className="signal-group signal-group-reputation">
            <SignalMetric
              className={metricClassName({ readonly: true })}
              ariaLabel={`Reputation ${formatReputation(signals.reputation.reputation)}${
                signals.reputation.rank > 0
                  ? `, rank ${signals.reputation.rank}`
                  : ''
              }`}
            >
              <span className={metricInnerClass}>
                <ProtocolMotionArrow className={arrowClass} />
                <span
                  className={signalValueClass(
                    Math.round(signals.reputation.reputation)
                  )}
                >
                  {formatReputation(signals.reputation.reputation)}
                </span>
              </span>
            </SignalMetric>
          </div>
        </>
      ) : null}

      <p className="portfolio-signals-caption">
        standing · solidarity · endorsements
        {signals.reputation ? ' · reputation' : ''}
        {signals.reputation && signals.reputation.rank > 0 ? (
          <span className="portfolio-signals-rank"> #{signals.reputation.rank}</span>
        ) : null}
      </p>
    </div>
  );
}
