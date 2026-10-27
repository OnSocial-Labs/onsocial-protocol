'use client';

import Link from 'next/link';
import { CatalogCoverImage } from '@/components/ui/catalog-thumb-image';
import { type ProfileCreatedPeek } from '@/lib/fetch-profile-peeks';
import { QuantityCount } from '@/features/scarces/quantity-count';
import {
  groupHoldingsForRail,
  type PortfolioHoldingPeek,
} from '@/lib/portfolio-holdings';

/** Owner wallet holdings — deep-link into Read / Play / Show pass / etc. */
export function PageDrawerHoldingsRail({
  holdings,
}: {
  holdings: PortfolioHoldingPeek[];
}) {
  if (holdings.length === 0) {
    return null;
  }

  return (
    <div
      className="page-drawer-media-rail os-scrollbar-none"
      aria-label="Collectibles"
    >
      {groupHoldingsForRail(holdings).map((item) => (
        <Link
          key={item.tokenId}
          href={item.href}
          scroll={false}
          className="page-drawer-media-card group"
          title={`${item.title} · ${item.actionLabel}`}
        >
          <span
            className={`page-drawer-media-cover${item.mediaUrl ? ' has-media' : ''}`}
            aria-hidden
          >
            {item.mediaUrl ? <CatalogCoverImage src={item.mediaUrl} /> : null}
          </span>
          <span className="page-drawer-media-body">
            <span className="page-drawer-media-title">{item.title}</span>
            <span className="page-drawer-media-meta">
              {item.kindLabel ? (
                <span className="page-drawer-media-kind">{item.kindLabel}</span>
              ) : null}
              <QuantityCount
                quantity={item.editionCount}
                className="page-drawer-media-editions"
              />
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

/** Public mint showcase — editions this account created. */
export function PageDrawerCreatedRail({
  created,
}: {
  created: ProfileCreatedPeek[];
}) {
  if (created.length === 0) {
    return null;
  }

  return (
    <div
      className="page-drawer-media-rail os-scrollbar-none"
      aria-label="Created scarces"
    >
      {created.map((item) => {
        const titleHint = item.kindLabel
          ? `${item.title} · ${item.kindLabel}`
          : item.title;
        return (
          <Link
            key={item.tokenId}
            href={item.href}
            scroll={false}
            className="page-drawer-media-card group"
            title={titleHint}
          >
            <span
              className={`page-drawer-media-cover${item.mediaUrl ? ' has-media' : ''}`}
              aria-hidden
            >
              {item.mediaUrl ? <CatalogCoverImage src={item.mediaUrl} /> : null}
            </span>
            <span className="page-drawer-media-body">
              <span className="page-drawer-media-title">{item.title}</span>
              <span className="page-drawer-media-meta">
                {item.kindLabel ? (
                  <span className="page-drawer-media-kind">
                    {item.kindLabel}
                  </span>
                ) : null}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
