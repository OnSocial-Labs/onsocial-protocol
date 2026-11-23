'use client';

import { OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { DropFansButton } from '@/components/drops/drop-row-fans';
import { CatalogThumbImage } from '@/components/ui/catalog-thumb-image';
import { DiscoveryPartyStack } from '@/components/discovery/discovery-party-stack';
import { DropsDiscoveryRowMenu } from '@/features/drops/drops-discovery-row-menu';
import { formatMarketVerbStamp } from '@/features/market/market-listings';
import { dollarStickerLabel } from '@/features/scarces/dollar-price';
import { collectionCreatorFaceSeed } from '@/features/scarces/collection-creator-face';
import {
  DropPlaceLink,
  seedCollectionViewFromStoreDrop,
} from '@/features/scarces/drop-place-open';
import { collectionPath } from '@/lib/app-routes';
import { socialTimeProps } from '@/lib/post-display';
import { profileStoreDropToDiscoveryItem } from '@/lib/profile-store-drop-discovery';
import { scarceRowPartyLead } from '@/lib/scarce-row-kind';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

function formatPriceNear(priceNear: string): string {
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function dropRowKindInput(drop: ProfileStoreDrop) {
  return {
    mediumKind: drop.mediumKind,
    audioFormat: drop.audioFormat,
    writingFormat: drop.writingFormat,
  };
}

function dropRowDealBits(drop: ProfileStoreDrop): string[] {
  const priceNear = drop.priceNear?.trim();
  const price =
    dollarStickerLabel(drop.usdE6) ??
    (priceNear ? `${formatPriceNear(priceNear)} NEAR` : 'Free');

  if (drop.status === 'sold_out') {
    return [price, 'Sold out'];
  }
  if (drop.status === 'ended') {
    return [price, 'Ended'];
  }
  if (
    (drop.status === 'live' || drop.status === 'upcoming') &&
    drop.remaining > 0
  ) {
    return [price, `${drop.remaining} left`];
  }
  if (drop.totalSupply > 0) {
    return [
      price,
      `${drop.totalSupply - drop.remaining}/${drop.totalSupply} minted`,
    ];
  }
  return [price];
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
  // Thin row seed; resolveDropOpenSeed prefers a remembered full view on open.
  const dropInitial = seedCollectionViewFromStoreDrop(drop, pageAccountId);
  const dropCreator = collectionCreatorFaceSeed({
    displayName,
    avatarUrl,
  });
  const showMint = onMint != null && isDropMintable(drop);
  const dealBits = dropRowDealBits(drop);
  const fanCount =
    drop.fanCount != null && drop.fanCount > 0 ? drop.fanCount : null;
  const droppedLabel =
    drop.createdAtMs != null && drop.createdAtMs > 0
      ? formatMarketVerbStamp('Dropped', drop.createdAtMs)
      : null;
  const menuItem = profileStoreDropToDiscoveryItem(drop, pageAccountId, {
    displayName,
    avatarUrl,
  });
  const thumbClass = `market-listing-thumb drops-discovery-thumb${
    drop.mediaUrl ? ' has-media' : ''
  }`;

  return (
    <div className="market-listing-row drops-discovery-row" role="listitem">
      <DropPlaceLink
        href={href}
        initial={dropInitial}
        initialCreator={dropCreator}
        className="market-listing-row-open"
        aria-label={
          drop.hasPlayable ? `Listen to ${drop.title}` : `Open ${drop.title}`
        }
      />
      <div className={thumbClass} aria-hidden>
        {drop.mediaUrl ? (
          <CatalogThumbImage src={drop.mediaUrl} />
        ) : (
          <span className="market-listing-thumb-fallback" aria-hidden />
        )}
        {drop.hasPlayable ? (
          <span className="market-listing-thumb-play" aria-hidden />
        ) : null}
      </div>
      <div className="drops-discovery-body">
        <div className="drops-discovery-top">
          <div className="market-listing-head drops-discovery-head">
            <p className="market-listing-title">{drop.title}</p>
          </div>
          <div
            className={`market-listing-action-col drops-discovery-action-col${
              !(droppedLabel && drop.createdAtMs != null) && !onToggleSave
                ? ' is-empty'
                : ''
            }`}
          >
            <div className="drops-discovery-head-trail">
              {droppedLabel && drop.createdAtMs != null ? (
                <time
                  className="market-listing-meta-right"
                  {...socialTimeProps(drop.createdAtMs)}
                >
                  {droppedLabel}
                </time>
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
          </div>
        </div>
        <div className="drops-discovery-ledger">
          <div className="drops-discovery-stack">
            <DiscoveryPartyStack
              accountId={pageAccountId}
              displayName={displayName}
              avatarUrl={avatarUrl}
              lead={scarceRowPartyLead(dropRowKindInput(drop))}
            />
            {dealBits.length > 0 || fanCount != null ? (
              <div className="drops-discovery-deal">
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
                    <DropFansButton
                      creatorId={pageAccountId}
                      collectionId={drop.collectionId}
                      title={drop.title}
                      fanIds={drop.fanIds}
                      fanCount={fanCount}
                    />
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          {showMint ? (
            <div className="market-listing-action-col drops-discovery-action-col">
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
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
