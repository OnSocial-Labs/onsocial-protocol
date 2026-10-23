'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { endorsementsPath } from '@/lib/overlay-routes';
import { standingPath } from '@/lib/profile-social-standings';
import { RollingNumber } from '@/components/ui/rolling-number';
import { formatFaceReputation } from '@/lib/profile-display';
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
  /** Bumps when the viewer's stand or endorsement confirms. */
  countRoll?: number;
}

const metricInnerClass = 'signal-metric-inner';
const arrowClass = 'signal-metric-arrow';

function signalValueClass(value: number): string {
  return value === 0 ? 'signal-value is-zero' : 'signal-value';
}

/** Same digit column as the rolling counts, including the decimal. */
function FaceFigures({ text }: { text: string }) {
  return (
    <span className="signal-figures">
      {Array.from(text).map((glyph, index) => (
        <span
          className={glyph === '.' ? 'signal-figure is-dot' : 'signal-figure'}
          key={`${glyph}-${index}`}
        >
          {glyph}
        </span>
      ))}
    </span>
  );
}

const ReputationFaceFacts = dynamic(
  () =>
    import('@/components/portfolio/reputation-face-facts').then(
      (mod) => mod.ReputationFaceFacts
    ),
  { ssr: false }
);

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
  countRoll = 0,
}: PortfolioSignalsProps) {
  const relationshipKnown = !relationshipLoading;
  const sharedSolidarity =
    relationshipKnown && viewerStanding && theyStandWithViewer;
  const [reputationOpen, setReputationOpen] = useState(false);
  const [reputationMounted, setReputationMounted] = useState(false);

  return (
    <>
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
                  <RollingNumber
                    value={signals.standingCount}
                    rollSignal={countRoll}
                    grouped
                    textRest
                  />
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
                  <RollingNumber
                    value={signals.standingWithCount}
                    rollSignal={countRoll}
                    grouped
                    textRest
                  />
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
                  <RollingNumber
                    value={signals.mutualStandingCount}
                    rollSignal={countRoll}
                    grouped
                    textRest
                  />
                </span>
                <ProtocolMotionArrow
                  className={`${arrowClass} signal-metric-arrow--out`}
                />
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
                href={endorsementsPath(accountId)}
                scroll={false}
                aria-label={`${signals.endorsementsReceivedCount} endorsements received`}
              >
                <span className={metricInnerClass}>
                  <ProtocolMotionArrow className={arrowClass} />
                  <span
                    className={signalValueClass(
                      signals.endorsementsReceivedCount
                    )}
                  >
                    <RollingNumber
                      value={signals.endorsementsReceivedCount}
                      rollSignal={countRoll}
                      grouped
                      textRest
                    />
                  </span>
                </span>
              </Link>
              <span className="signal-dot" aria-hidden>
                ·
              </span>
              <Link
                className={metricClassName()}
                href={endorsementsPath(accountId, { mode: 'given' })}
                scroll={false}
                aria-label={`${signals.endorsementsGivenCount} endorsements given`}
              >
                <span className={metricInnerClass}>
                  <span
                    className={signalValueClass(signals.endorsementsGivenCount)}
                  >
                    <RollingNumber
                      value={signals.endorsementsGivenCount}
                      rollSignal={countRoll}
                      grouped
                      textRest
                    />
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
                <button
                  type="button"
                  className={metricClassName()}
                  aria-label={`Reputation ${formatFaceReputation(signals.reputation.reputation)}${
                    signals.reputation.rank > 0
                      ? `, rank ${signals.reputation.rank}`
                      : ''
                  }`}
                  aria-haspopup="dialog"
                  aria-expanded={reputationOpen}
                  onClick={() => {
                    setReputationMounted(true);
                    setReputationOpen(true);
                  }}
                >
                  <span className={metricInnerClass}>
                    <ProtocolMotionArrow className={arrowClass} />
                    <span
                      className={signalValueClass(
                        Math.round(signals.reputation.reputation)
                      )}
                    >
                      <FaceFigures
                        text={formatFaceReputation(
                          signals.reputation.reputation
                        )}
                      />
                    </span>
                  </span>
                </button>
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
            <span className="portfolio-signals-rank">
              {' '}
              #{signals.reputation.rank}
            </span>
          ) : null}
        </p>
      </div>
      {reputationMounted && signals.reputation ? (
        <ReputationFaceFacts
          open={reputationOpen}
          accountId={accountId}
          reputation={signals.reputation}
          onClose={() => setReputationOpen(false)}
        />
      ) : null}
    </>
  );
}
