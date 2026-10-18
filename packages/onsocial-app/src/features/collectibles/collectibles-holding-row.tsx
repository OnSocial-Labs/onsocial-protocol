'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { DiscoveryPartyStack } from '@/components/discovery/discovery-party-stack';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import { OwnedShowPassSheet } from '@/features/scarces/owned-show-pass-sheet';
import { isPassMediumKind } from '@/features/scarces/ticket-pass-payload';
import { socialTimeProps } from '@/lib/post-display';
import type { PortfolioHoldingPeek } from '@/lib/portfolio-holdings';
import { collectionPath } from '@/lib/app-routes';
import { OsRowAction } from '@/lib/os-row-action';

interface CollectiblesHoldingRowProps {
  item: PortfolioHoldingPeek;
  /** Collapsed edition count when several tokens share one collection. */
  editionCount?: number;
  /** Owner-only manage menu — rendered beside the received time. */
  ownerMenu?: ReactNode;
  /** Hide the maker when the row already sits under a creator heading. */
  hideCreator?: boolean;
  authorDisplayName?: string | null;
  authorAvatarUrl?: string | null;
}

function formatHoldingPrice(priceNear: string): string {
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/** Kind, collapsed count, or the list price when this copy is for sale. */
export function collectiblesHoldingFact(
  item: Pick<
    PortfolioHoldingPeek,
    'kindLabel' | 'listedPriceNear' | 'listingKind'
  >,
  editionCount = 1
): string {
  const kind = item.kindLabel.trim();
  const count = editionCount > 1 ? `×${editionCount}` : '';
  const price = item.listedPriceNear?.trim();
  const parts = [kind, count];
  if (price) {
    const amount = `${formatHoldingPrice(price)} NEAR`;
    if (item.listingKind === 'auction') parts.push('Reserve');
    parts.push(amount);
  }
  return parts.filter(Boolean).join(' · ');
}

/** Owned scarce in the Collectibles vault — use-first CTA (Read / Play / …). */
export function CollectiblesHoldingRow({
  item,
  editionCount = 1,
  ownerMenu = null,
  hideCreator = false,
  authorDisplayName = null,
  authorAvatarUrl = null,
}: CollectiblesHoldingRowProps) {
  const creatorId = item.creatorId?.trim() || null;
  const mintedRel =
    item.mintedAtMs != null && item.mintedAtMs > 0
      ? formatMarketRelativeTime(item.mintedAtMs)
      : '';
  const [brokenMediaUrl, setBrokenMediaUrl] = useState<string | null>(null);
  const [passOpen, setPassOpen] = useState(false);
  const [passMounted, setPassMounted] = useState(false);
  const showThumb = Boolean(item.mediaUrl) && brokenMediaUrl !== item.mediaUrl;
  const collectionId = item.collectionId?.trim() || '';
  const opensPass = isPassMediumKind(item.mediumKind) && Boolean(collectionId);
  const dropHref = collectionId ? collectionPath(collectionId) : null;
  const fact = collectiblesHoldingFact(item, editionCount);
  const showMaker = Boolean(creatorId) && !hideCreator;

  const mainBody = (
    <>
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
      <div className="market-listing-copy drops-discovery-copy">
        <div className="market-listing-head drops-discovery-head">
          <p className="market-listing-title">{item.title}</p>
        </div>
        {showMaker && creatorId ? (
          <DiscoveryPartyStack
            accountId={creatorId}
            displayName={authorDisplayName}
            avatarUrl={authorAvatarUrl}
            lead="by"
          />
        ) : null}
        {fact ? (
          <p className="market-listing-meta market-listing-meta--price">
            <span className="market-listing-own">{fact}</span>
          </p>
        ) : null}
      </div>
    </>
  );

  return (
    <div
      className="market-listing-row collectibles-holding-row"
      role="listitem"
    >
      {opensPass && dropHref ? (
        <Link
          href={dropHref}
          scroll={false}
          className="market-listing-row-open"
          aria-label={`Open drop for ${item.title}`}
        />
      ) : null}
      {opensPass ? (
        <div className="collectibles-holding-row-main">{mainBody}</div>
      ) : (
        <Link
          href={item.href}
          scroll={false}
          className="collectibles-holding-row-main"
          title={item.title}
        >
          {mainBody}
        </Link>
      )}
      <div className="market-listing-action-col drops-discovery-action-col collectibles-holding-action-col">
        <div className="drops-discovery-head-trail">
          {mintedRel && item.mintedAtMs != null ? (
            <time
              className="market-listing-meta-right"
              {...socialTimeProps(item.mintedAtMs)}
            >
              {mintedRel}
            </time>
          ) : null}
          {ownerMenu}
        </div>
        {opensPass ? (
          <OsRowAction
            className="collectibles-holding-action"
            aria-label={`${item.actionLabel} ${item.title}`}
            onClick={() => {
              setPassMounted(true);
              setPassOpen(true);
            }}
          >
            {item.actionLabel}
          </OsRowAction>
        ) : (
          <OsRowAction
            href={item.href}
            className="collectibles-holding-action"
            aria-label={`${item.actionLabel} ${item.title}`}
          >
            {item.actionLabel}
          </OsRowAction>
        )}
      </div>
      {opensPass && passMounted ? (
        <OwnedShowPassSheet
          open={passOpen}
          onClose={() => setPassOpen(false)}
          title={item.title}
          cover={item.mediaUrl}
          collectionId={collectionId}
          tokenId={item.tokenId}
        />
      ) : null}
    </div>
  );
}
