import Link from 'next/link';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { formatCount } from '@/lib/profile-display';
import { overlayPath } from '@/lib/overlay-routes';
import type { ProfileSignals } from '@/lib/profile-signals';

interface PortfolioSignalsProps {
  accountId: string;
  signals: ProfileSignals;
}

const metricBtnClass = 'signal-metric group';
const metricInnerClass = 'inline-flex items-center gap-0.5';
const arrowClass = 'h-2.5 w-2.5 shrink-0';

function formatReputation(value: number): string {
  if (value >= 1000) {
    return formatCount(Math.round(value));
  }
  return value.toFixed(value >= 100 ? 0 : 1);
}

function signalValueClass(value: number): string {
  return value === 0 ? 'signal-value is-zero' : 'signal-value';
}

export function PortfolioSignals({ accountId, signals }: PortfolioSignalsProps) {
  const standingHref = overlayPath(accountId, 'standing');
  const endorsementsHref = overlayPath(accountId, 'endorsements');
  const reputationHref = overlayPath(accountId, 'reputation');

  return (
    <div className="portfolio-signals" aria-label="Profile signals">
      <div className="signal-group signal-group-standing">
        <Link
          className={metricBtnClass}
          href={standingHref}
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
          className={metricBtnClass}
          href={standingHref}
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
          className={`${metricBtnClass} signal-metric-solidarity`}
          href={standingHref}
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
        <Link
          className={metricBtnClass}
          href={endorsementsHref}
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
          className={metricBtnClass}
          href={endorsementsHref}
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

      {signals.reputation ? (
        <>
          <span className="signal-sep" aria-hidden>
            ·
          </span>
          <div className="signal-group signal-group-reputation">
            <Link
              className={metricBtnClass}
              href={reputationHref}
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
