'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import { OwnedShowPassSheet } from '@/features/scarces/owned-show-pass-sheet';
import { isPassMediumKind } from '@/features/scarces/ticket-pass-payload';
import { socialTimeProps } from '@/lib/post-display';
import { displayName } from '@/lib/profile-display';
import type { PortfolioHoldingPeek } from '@/lib/portfolio-holdings';
import { OsRowAction } from '@/lib/os-row-action';

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
  const titleHint = [
    item.title,
    item.actionLabel,
    editionCount > 1 ? `×${editionCount}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

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
          {mintedRel && item.mintedAtMs != null ? (
            <span className="market-listing-own">
              {' · '}
              <time {...socialTimeProps(item.mintedAtMs)}>{mintedRel}</time>
            </span>
          ) : null}
        </p>
      </div>
    </>
  );

  return (
    <div
      className="market-listing-row collectibles-holding-row"
      role="listitem"
    >
      {opensPass ? (
        <button
          type="button"
          className="collectibles-holding-row-main"
          title={titleHint}
          onClick={() => {
            setPassMounted(true);
            setPassOpen(true);
          }}
        >
          {mainBody}
        </button>
      ) : (
        <Link
          href={item.href}
          scroll={false}
          className="collectibles-holding-row-main"
          title={titleHint}
        >
          {mainBody}
        </Link>
      )}
      <div className="market-listing-action-col collectibles-holding-action-col">
        {ownerMenu ? (
          <div className="drops-discovery-head-trail">{ownerMenu}</div>
        ) : null}
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
