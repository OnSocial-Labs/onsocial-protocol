'use client';

import Link from 'next/link';
import { OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { DropRowFans } from '@/components/drops/drop-row-fans';
import { DiscoveryPartyStack } from '@/components/discovery/discovery-party-stack';
import { DropsDiscoveryRowMenu } from '@/features/drops/drops-discovery-row-menu';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import { collectionPath } from '@/lib/app-routes';
import { profileStoreDropToDiscoveryItem } from '@/lib/profile-store-drop-discovery';
import { scarceRowFormatLabel } from '@/lib/scarce-row-kind';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

function formatPriceNear(priceNear: string): string {
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function dropRowDealBits(drop: ProfileStoreDrop): string[] {
  const priceNear = drop.priceNear?.trim();
  const price = priceNear ? `${formatPriceNear(priceNear)} NEAR` : 'Free';
  const format = scarceRowFormatLabel({
    mediumKind: drop.mediumKind,
    audioFormat: drop.audioFormat,
    writingFormat: drop.writingFormat,
  });

  if (drop.status === 'sold_out') {
    return [price, 'Sold out', format].filter(Boolean) as string[];
  }
  if (drop.status === 'ended') {
    return [price, 'Ended', format].filter(Boolean) as string[];
  }
  if (
    (drop.status === 'live' || drop.status === 'upcoming') &&
    drop.remaining > 0
  ) {
    return [price, `${drop.remaining} left`, format].filter(Boolean) as string[];
  }
  if (drop.totalSupply > 0) {
    return [
      price,
      `${drop.totalSupply - drop.remaining}/${drop.totalSupply} minted`,
      format,
    ].filter(Boolean) as string[];
  }
  return [price, format].filter(Boolean) as string[];
}

export function isDropMintable(drop: ProfileStoreDrop): boolean {
  return drop.status === 'live' && drop.remaining > 0;
}

/**
 * Profile drop row — parity with Drops discovery (`DropRow`): party stack,
 * deal line, fans, time + ⋮ menu, optional Mint.
 */
export function PortfolioDropRow({
  pageAccountId,
  displayName,
  avatarUrl,
  drop,
  onMint,
  saved = false,
  savePending = false,
  onToggleSave,
  onOwnerManaged,
}: {
  pageAccountId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  drop: ProfileStoreDrop;
  onMint?: (drop: ProfileStoreDrop) => void;
  saved?: boolean;
  savePending?: boolean;
  onToggleSave?: () => void;
  onOwnerManaged?: (change: 'paused' | 'resumed' | 'deleted') => void;
}) {
  const href = collectionPath(drop.collectionId);
  const showMint = onMint != null && isDropMintable(drop);
  const dealBits = dropRowDealBits(drop);
  const fanCount = drop.fanCount;
  const droppedLabel =
    drop.createdAtMs != null && drop.createdAtMs > 0
      ? formatMarketRelativeTime(drop.createdAtMs)
      : null;
  const menuItem = profileStoreDropToDiscoveryItem(drop, pageAccountId, {
    displayName,
    avatarUrl,
  });

  return (
    <div className="market-listing-row drops-discovery-row" role="listitem">
      <Link
        href={href}
        scroll={false}
        className={`market-listing-thumb drops-discovery-thumb${
          drop.mediaUrl ? ' has-media' : ''
        }`}
        aria-label={
          drop.hasPlayable ? `Listen to ${drop.title}` : `Open ${drop.title}`
        }
      >
        {drop.mediaUrl ? (
          <img src={drop.mediaUrl} alt="" />
        ) : (
          <span className="market-listing-thumb-fallback" aria-hidden />
        )}
        {drop.hasPlayable ? (
          <span className="market-listing-thumb-play" aria-hidden />
        ) : null}
      </Link>
      <div className="market-listing-copy drops-discovery-copy">
        <div className="market-listing-head drops-discovery-head">
          <Link
            href={href}
            scroll={false}
            className="market-listing-title"
          >
            {drop.title}
          </Link>
        </div>
        <DiscoveryPartyStack
          accountId={pageAccountId}
          displayName={displayName}
          avatarUrl={avatarUrl}
        />
        {dealBits.length > 0 || fanCount != null ? (
          <Link
            href={href}
            scroll={false}
            className="drops-discovery-deal"
            aria-label={[
              ...dealBits,
              fanCount != null
                ? fanCount === 1
                  ? '1 fan'
                  : `${fanCount} fans`
                : null,
            ]
              .filter(Boolean)
              .join(', ')}
          >
            {dealBits.length > 0 ? (
              <span className="drops-discovery-deal-bits">
                {dealBits.join(' · ')}
              </span>
            ) : null}
            {fanCount != null ? (
              <>
                {dealBits.length > 0 ? (
                  <span className="drops-discovery-deal-sep" aria-hidden>
                    {' · '}
                  </span>
                ) : null}
                <DropRowFans fanIds={drop.fanIds} fanCount={fanCount} />
              </>
            ) : null}
          </Link>
        ) : null}
      </div>
      <div className="market-listing-action-col drops-discovery-action-col">
        <div className="drops-discovery-head-trail">
          {droppedLabel ? (
            <span className="market-listing-meta-right">{droppedLabel}</span>
          ) : null}
          {onToggleSave ? (
            <DropsDiscoveryRowMenu
              item={menuItem}
              saved={saved}
              savePending={savePending}
              onToggleSave={onToggleSave}
              onOwnerManaged={onOwnerManaged}
            />
          ) : null}
        </div>
        {showMint ? (
          <OsSheetActions
            layout="row-compact"
            tone="frosted-primary"
            size="sm"
            borderless
            className="market-listing-action drops-discovery-action"
          >
            <OsSheetAction
              type="button"
              variant="primary"
              ready
              aria-label={`Mint ${drop.title}`}
              onClick={() => onMint(drop)}
            >
              Mint
            </OsSheetAction>
          </OsSheetActions>
        ) : null}
      </div>
    </div>
  );
}
