'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { displayName } from '@/lib/profile-display';
import type { PortfolioHoldingPeek } from '@/lib/portfolio-holdings';

interface CollectiblesHoldingRowProps {
  item: PortfolioHoldingPeek;
  /** Collapsed edition count when several tokens share one collection. */
  editionCount?: number;
  /** Owner-only manage menu — rendered beside the use CTA. */
  ownerMenu?: ReactNode;
  /** Hide the creator when the row already sits under a creator heading. */
  hideCreator?: boolean;
}

/** Owned scarce in the Collectibles vault — use-first CTA (Read / Play / …). */
export function CollectiblesHoldingRow({
  item,
  editionCount = 1,
  ownerMenu = null,
  hideCreator = false,
}: CollectiblesHoldingRowProps) {
  const creatorId = item.creatorId?.trim() || null;
  const [brokenMediaUrl, setBrokenMediaUrl] = useState<string | null>(null);
  const showThumb = Boolean(item.mediaUrl) && brokenMediaUrl !== item.mediaUrl;
  const titleHint = [
    item.title,
    item.actionLabel,
    editionCount > 1 ? `×${editionCount}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="market-listing-row collectibles-holding-row" role="listitem">
      <Link
        href={item.href}
        scroll={false}
        className="collectibles-holding-row-main"
        title={titleHint}
      >
        <div
          className={`market-listing-thumb${showThumb ? ' has-media' : ''}`}
          aria-hidden
        >
          {showThumb ? (
            <img
              src={item.mediaUrl!}
              alt=""
              onError={() => setBrokenMediaUrl(item.mediaUrl ?? null)}
            />
          ) : (
            <span className="market-listing-thumb-fallback" />
          )}
        </div>
        <div className="market-listing-copy">
          <div className="market-listing-head">
            <p className="market-listing-title">{item.title}</p>
          </div>
          <p className="market-listing-meta">
            <span className="market-listing-own">{item.kindLabel}</span>
            {editionCount > 1 ? (
              <span className="market-listing-own"> · ×{editionCount}</span>
            ) : item.editionSeat != null ? (
              <span className="market-listing-own"> · #{item.editionSeat}</span>
            ) : null}
            {creatorId && !hideCreator ? (
              <span className="market-listing-own">
                {' · '}
                {displayName(creatorId)}
              </span>
            ) : null}
          </p>
        </div>
      </Link>
      <div className="market-listing-action-col collectibles-holding-action-col">
        {ownerMenu ? (
          <div className="drops-discovery-head-trail">{ownerMenu}</div>
        ) : null}
        <Link
          href={item.href}
          scroll={false}
          className="page-drawer-section-action collectibles-holding-action"
          aria-label={`${item.actionLabel} ${item.title}`}
        >
          {item.actionLabel}
        </Link>
      </div>
    </div>
  );
}
