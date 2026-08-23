import Link from 'next/link';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { overlayPath } from '@/lib/overlay-routes';
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
  /** Viewer relationship is still resolving; avoid false relationship highlights. */
  relationshipLoading?: boolean;
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
}): string {
  let className = metricBaseClass;
  if (options?.solidarity) className += ' signal-metric-solidarity';
  if (options?.highlight) className += ' signal-metric--highlight';
  if (options?.solidarity && options?.highlight) {
    className += ' signal-metric--solidarity-active';
  }
  return className;
}

export function PortfolioSignals({
  accountId,
  signals,
  viewerStanding = false,
  theyStandWithViewer = false,
  relationshipLoading = false,
}: PortfolioSignalsProps) {
  const relationshipKnown = !relationshipLoading;
  const sharedSolidarity =
    relationshipKnown && viewerStanding && theyStandWithViewer;

  return (
    <div
      className={`portfolio-signals${
        relationshipLoading ? ' is-relationship-loading' : ''
      }`}
      aria-label="Profile signals"
    >
      <div className="portfolio-signals-metrics">
        <div className="signal-group signal-group-standing">
        <Link
          className={metricClassName({
            highlight:
              relationshipKnown && theyStandWithViewer && !sharedSolidarity,
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
            <ProtocolMotionArrow className={`${arrowClass} signal-metric-arrow--out`} />
          </span>
        </Link>
        </div>

        <div className="signal-metrics-chunk">
          <span className="signal-sep" aria-hidden>
            ·
          </span>
          <div className="signal-group signal-group-endorse">
        <Link
          className={metricClassName()}
          href={overlayPath(accountId, 'endorsements')}
          scroll={false}
          aria-label={`${signals.endorsementsReceivedCount} endorsements received`}
        >
          <span className={metricInnerClass}>
            <ProtocolMotionArrow className={arrowClass} />
            <span className={signalValueClass(signals.endorsementsReceivedCount)}>
              {formatCount(signals.endorsementsReceivedCount)}
            </span>
          </span>
        </Link>
        <span className="signal-dot" aria-hidden>
          ·
        </span>
        <Link
          className={metricClassName()}
          href={overlayPath(accountId, 'endorsements')}
          scroll={false}
          aria-label={`${signals.endorsementsGivenCount} endorsements given`}
        >
          <span className={metricInnerClass}>
            <span className={signalValueClass(signals.endorsementsGivenCount)}>
              {formatCount(signals.endorsementsGivenCount)}
            </span>
            <ProtocolMotionArrow className={arrowClass} />
          </span>
        </Link>
          </div>
        </div>

        {signals.reputation ? (
          <div className="signal-metrics-chunk">
            <span className="signal-sep" aria-hidden>
              ·
            </span>
            <div className="signal-group signal-group-reputation">
              <Link
                className={metricClassName()}
                href={overlayPath(accountId, 'reputation')}
                scroll={false}
                aria-label={`Reputation ${formatReputation(signals.reputation.reputation)}${
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
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      <p
        className="portfolio-signals-caption"
        aria-label={[
          'standing',
          'solidarity',
          'endorsements',
          signals.reputation
            ? `reputation${
                signals.reputation.rank > 0
                  ? ` rank ${signals.reputation.rank}`
                  : ''
              }`
            : null,
        ]
          .filter(Boolean)
          .join(', ')}
      >
        {`STANDING·SOLIDARITY·ENDORSEMENTS${
          signals.reputation ? '·REPUTATION' : ''
        }`}
        {signals.reputation && signals.reputation.rank > 0 ? (
          <span className="portfolio-signals-rank"> #{signals.reputation.rank}</span>
        ) : null}
      </p>
    </div>
  );
}
