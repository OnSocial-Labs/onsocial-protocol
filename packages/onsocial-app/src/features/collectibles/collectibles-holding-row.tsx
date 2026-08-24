'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { fallbackLabel } from '@/lib/profile-display';
import type { PortfolioHoldingPeek } from '@/lib/portfolio-holdings';

interface CollectiblesHoldingRowProps {
  item: PortfolioHoldingPeek;
  /** Collapsed edition count when several tokens share one collection. */
  editionCount?: number;
  /** Owner-only manage menu — rendered beside the use CTA. */
  ownerMenu?: ReactNode;
}

function formatListedNear(priceNear: string): string {
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/** Owned scarce in the Collectibles vault — use-first CTA (Read / Play / …). */
export function CollectiblesHoldingRow({
  item,
  editionCount = 1,
  ownerMenu = null,
}: CollectiblesHoldingRowProps) {
  const listedNear = item.listedPriceNear?.trim();
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
            {listedNear ? (
              <span className="market-listing-own">
                {' · '}
                {item.listingKind === 'auction' ? 'Reserve' : 'Listed'} ·{' '}
                {formatListedNear(listedNear)} NEAR
              </span>
            ) : null}
            {creatorId ? (
              <span className="market-listing-own">
                {' · '}@{fallbackLabel(creatorId)}
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
