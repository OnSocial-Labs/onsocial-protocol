'use client';

import Link from 'next/link';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { useLiveIncomingStandingCount } from '@/hooks/use-live-profile-signals';
import { formatCount } from '@/lib/profile-display';
import { standingPath } from '@/lib/profile-social-standings';

/** Incoming stand count inline on DAO Stand · Support rows. */
export function PortfolioDaoGestureStandingCount({
  accountId,
  baseCount,
}: {
  accountId: string;
  baseCount: number;
}) {
  const count = useLiveIncomingStandingCount(accountId, baseCount);
  if (count <= 0) {
    return null;
  }

  return (
    <Link
      href={standingPath(accountId, 'incoming')}
      scroll={false}
      className="portfolio-identity-gesture-standing-count group"
      aria-label={`${count} stand with them`}
    >
      <span className="signal-group signal-group-standing" aria-hidden>
        <ProtocolMotionArrow className="signal-metric-arrow" />
        <span className="signal-value">{formatCount(count)}</span>
      </span>
    </Link>
  );
}
