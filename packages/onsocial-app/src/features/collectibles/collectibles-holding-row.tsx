'use client';

import Link from 'next/link';
import type { PortfolioHoldingPeek } from '@/lib/portfolio-holdings';

interface CollectiblesHoldingRowProps {
  item: PortfolioHoldingPeek;
}

/** Owned scarce in the Collectibles vault — use-first CTA (Read / Play / …). */
export function CollectiblesHoldingRow({ item }: CollectiblesHoldingRowProps) {
  return (
    <Link
      href={item.href}
      scroll={false}
      className="market-listing-row collectibles-holding-row"
      role="listitem"
      title={`${item.title} · ${item.actionLabel}`}
    >
      <div
        className={`market-listing-thumb${item.mediaUrl ? ' has-media' : ''}`}
        aria-hidden
      >
        {item.mediaUrl ? (
          <img src={item.mediaUrl} alt="" />
        ) : (
          <span className="market-listing-thumb-fallback" />
        )}
      </div>
      <div className="market-listing-copy">
        <div className="market-listing-head">
          <p className="market-listing-title">{item.title}</p>
        </div>
        <p className="market-listing-meta">
          {item.kindLabel ? (
            <span className="market-listing-own">{item.kindLabel}</span>
          ) : (
            <span className="market-listing-own">Scarce</span>
          )}
        </p>
      </div>
      {/* Decorative — row is the link; size matches Market Buy/Sell pills. */}
      <span className="collectibles-holding-action" aria-hidden>
        {item.actionLabel}
      </span>
    </Link>
  );
}
