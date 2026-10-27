'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DiscoveryPartyStack } from '@/components/discovery/discovery-party-stack';
import { CatalogThumbImage } from '@/components/ui/catalog-thumb-image';
import {
  marketPostLayerLinkHandlers,
  useMarketPostLayer,
} from '@/features/market/market-post-layer';
import {
  OsSheetAction,
  OsSheetActions,
  normalizeSocialTimestamp,
} from '@onsocial/ui';
import {
  auctionExpiresAtMs,
  formatMarketRelativeTime,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { marketAuctionClockLabel } from '@/features/scarces/scarce-auction';
import { socialTimeProps } from '@/lib/post-display';
import { CollectiblesHoldingRowMenu } from '@/features/collectibles/collectibles-holding-row-menu';
import { OwnedShowPassSheet } from '@/features/scarces/owned-show-pass-sheet';
import { isPassMediumKind } from '@/features/scarces/ticket-pass-payload';
import { dollarStickerLabel } from '@/features/scarces/dollar-price';
import { requestDropCompose } from '@/features/scarces/drop-compose-draft';
import { collectionPath } from '@/lib/app-routes';
import {
  holdingsActionLabel,
  holdingsHrefForOwned,
} from '@/lib/portfolio-holdings';
import { OsRowAction } from '@/lib/os-row-action';
import { postHrefFromSourcePath } from '@/lib/scarce-creator-earnings';

interface MarketOwnedRowProps {
  item: OwnedScarceItem;
  settlePending?: boolean;
  /** Highest open offer (NEAR), when known from the offers catalog. */
  highestOfferNear?: string | null;
  offerCount?: number;
  /** Clock for ended-auction settle CTA. */
  nowMs?: number;
  onSell: (item: OwnedScarceItem) => void;
  onTransfer?: (item: OwnedScarceItem) => void;
  /** Refresh after the manage drawer delists or burns. */
  onChanged?: () => void;
  onSettle?: (item: OwnedScarceItem) => void;
  onOffers?: (item: OwnedScarceItem) => void;
  /** Maker face. The account id comes from the item. */
  authorDisplayName?: string | null;
  authorAvatarUrl?: string | null;
}

/** Corner clock. Listed rows say Listed / Ended / Ends in. The rest say when it arrived. */
export function ownedListingClock(
  item: Pick<
    OwnedScarceItem,
    'listingKind' | 'expiresAtNs' | 'listedAtMs' | 'mintedAtMs'
  >,
  nowMs: number
): { label: string; atMs: number | null } | null {
  if (item.listingKind === 'auction') {
    const label = marketAuctionClockLabel(item.expiresAtNs, nowMs);
    if (label) return { label, atMs: auctionExpiresAtMs(item.expiresAtNs) };
  } else if (item.listingKind === 'fixed') {
    const atMs = normalizeSocialTimestamp(item.listedAtMs);
    const rel = atMs ? formatMarketRelativeTime(atMs, nowMs) : '';
    if (atMs && rel) return { label: `Listed ${rel}`, atMs };
  }
  const mintedAtMs = normalizeSocialTimestamp(item.mintedAtMs);
  if (!mintedAtMs) return null;
  const rel = formatMarketRelativeTime(mintedAtMs, nowMs);
  if (!rel) return null;
  return { label: rel, atMs: mintedAtMs };
}

/** Line under the title. The corner already says Listed / Ended / Ends in. */
export function ownedListingStatusBit(
  item: Pick<OwnedScarceItem, 'listingKind' | 'bidCount'>,
  clockLabel: string | null
): string | null {
  if (item.listingKind === 'auction') {
    const bids = item.bidCount ?? 0;
    if (bids > 0) return bids === 1 ? '1 bid' : `${bids} bids`;
    return clockLabel ? null : 'Auction live';
  }
  if (item.listingKind != null) return clockLabel ? null : 'Listed';
  return 'Ready to sell';
}

function formatPriceNear(priceNear: string): string {
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/** Maker on a Yours row: drop creator, otherwise the post author. */
export function ownedAuthorAccountId(
  item: Pick<OwnedScarceItem, 'creatorId' | 'sourcePostPath'>
): string {
  const creatorId = item.creatorId?.trim();
  if (creatorId) return creatorId;
  const path = item.sourcePostPath?.trim();
  const author = path?.match(/^(.+)\/post\/(.+)$/)?.[1]?.trim();
  return author || '';
}

/** Owned scarce in Market “Yours” — Manage; Post when listed (Drop or resale). */
export function MarketOwnedRow({
  item,
  settlePending = false,
  highestOfferNear = null,
  offerCount = 0,
  nowMs,
  onSell,
  onTransfer,
  onChanged,
  onSettle,
  onOffers,
  authorDisplayName = null,
  authorAvatarUrl = null,
}: MarketOwnedRowProps) {
  const router = useRouter();
  const openMarketPost = useMarketPostLayer();
  const listed = item.listingKind != null;
  const auction = item.listingKind === 'auction';
  const auctionHasBids = auction && (item.bidCount ?? 0) > 0;
  const endsAtMs = auctionExpiresAtMs(item.expiresAtNs);
  const auctionEnded =
    auction &&
    endsAtMs != null &&
    typeof nowMs === 'number' &&
    endsAtMs <= nowMs;
  const needsSettle = Boolean(auctionHasBids && auctionEnded && onSettle);
  // Offers are open-book (no list-time opt-in). Only surface the control when
  // the catalog shows at least one live offer — empty "Offers" next to Sell
  // reads like a parallel primary action.
  const hasOffers = offerCount > 0 && Boolean(highestOfferNear?.trim());
  const showOffers = Boolean(onOffers) && hasOffers;
  const clock =
    typeof nowMs === 'number' ? ownedListingClock(item, nowMs) : null;
  const statusBit = ownedListingStatusBit(item, clock?.label ?? null);
  const showPrice = Boolean(listed && item.listedPriceNear);
  const offersLabel = offerCount > 1 ? 'Offers' : 'Offer';
  const offersAriaLabel = highestOfferNear?.trim()
    ? offerCount > 1
      ? `Offers, top ${formatPriceNear(highestOfferNear)} NEAR`
      : `Offer ${formatPriceNear(highestOfferNear)} NEAR`
    : offersLabel;
  const useHref = holdingsHrefForOwned({
    tokenId: item.tokenId,
    collectionId: item.collectionId,
    sourcePostPath: item.sourcePostPath,
    postHref: item.postHref,
    mediumKind: item.mediumKind,
  });
  const useAction = holdingsActionLabel(item.mediumKind);
  // Posted scarce → open the source post (mint/buy lives there) when not listed.
  const sourcePostHref =
    item.postHref?.trim() ||
    postHrefFromSourcePath(item.sourcePostPath) ||
    null;
  const showViewSourcePost = Boolean(sourcePostHref);
  // Listed Drop edition or post-minted scarce → Post announce (Resale in feed).
  const showPostCompose =
    listed && Boolean(item.collectionId?.trim() || item.tokenId?.trim());
  const [brokenMediaUrl, setBrokenMediaUrl] = useState<string | null>(null);
  const [passOpen, setPassOpen] = useState(false);
  const [passMounted, setPassMounted] = useState(false);
  const authorId = ownedAuthorAccountId(item);
  const showThumb = Boolean(item.mediaUrl) && brokenMediaUrl !== item.mediaUrl;
  const passCollectionId = item.collectionId?.trim() || '';
  const opensPass =
    isPassMediumKind(item.mediumKind) && Boolean(passCollectionId);
  const dropHref = passCollectionId ? collectionPath(passCollectionId) : null;
  const openPass = () => {
    setPassMounted(true);
    setPassOpen(true);
  };

  const thumb = showThumb ? (
    <CatalogThumbImage
      src={item.mediaUrl!}
      onError={() => setBrokenMediaUrl(item.mediaUrl ?? null)}
    />
  ) : (
    <span className="market-listing-thumb-fallback" aria-hidden />
  );

  const title = opensPass ? (
    item.title
  ) : useHref ? (
    <Link
      href={useHref}
      scroll={false}
      className="market-listing-title-link"
      {...marketPostLayerLinkHandlers(useHref, openMarketPost)}
    >
      {item.title}
    </Link>
  ) : (
    item.title
  );

  return (
    <div className="market-listing-row" role="listitem">
      {opensPass && dropHref ? (
        <Link
          href={dropHref}
          scroll={false}
          className="market-listing-row-open"
          aria-label={`Open drop for ${item.title}`}
        />
      ) : null}
      {opensPass ? (
        <div
          className={`market-listing-thumb${showThumb ? ' has-media' : ''}`}
          aria-hidden
        >
          {thumb}
        </div>
      ) : useHref ? (
        <Link
          href={useHref}
          scroll={false}
          className={`market-listing-thumb${showThumb ? ' has-media' : ''}`}
          aria-label={
            useAction === 'Read'
              ? `Open drop for ${item.title}`
              : `${useAction} ${item.title}`
          }
          {...marketPostLayerLinkHandlers(useHref, openMarketPost)}
        >
          {thumb}
        </Link>
      ) : (
        <div
          className={`market-listing-thumb${showThumb ? ' has-media' : ''}`}
          aria-hidden
        >
          {thumb}
        </div>
      )}
      <div className="market-listing-copy drops-discovery-copy">
        <div className="market-listing-head drops-discovery-head">
          <p className="market-listing-title">{title}</p>
        </div>
        {authorId ? (
          <DiscoveryPartyStack
            accountId={authorId}
            displayName={authorDisplayName}
            avatarUrl={authorAvatarUrl}
            lead="by"
          />
        ) : null}
        <p className="market-listing-meta market-listing-meta--price">
          {showPrice ? (
            <span className="market-listing-price">
              {auction ? 'Reserve · ' : ''}
              {dollarStickerLabel(item.listedUsdE6) ??
                `${formatPriceNear(item.listedPriceNear!)} NEAR`}
            </span>
          ) : null}
          {statusBit ? (
            <span className="market-listing-own">
              {showPrice ? ' · ' : ''}
              {statusBit}
            </span>
          ) : null}
          {showOffers ? (
            <span className="market-listing-own">
              {showPrice || statusBit ? ' · ' : ''}
              {offerCount === 1
                ? `Offer ${formatPriceNear(highestOfferNear!)} NEAR`
                : `${offerCount} offers · top ${formatPriceNear(highestOfferNear!)} NEAR`}
            </span>
          ) : null}
        </p>
      </div>
      <div className="market-listing-action-col drops-discovery-action-col">
        <div className="drops-discovery-head-trail">
          {clock ? (
            <time
              className="market-listing-meta-right"
              {...socialTimeProps(clock.atMs)}
            >
              {clock.label}
            </time>
          ) : null}
          <CollectiblesHoldingRowMenu
            item={item}
            showOpenInMarket={false}
            onList={() => onSell(item)}
            onTransfer={onTransfer ? () => onTransfer(item) : undefined}
            onDelisted={onChanged}
          />
        </div>
        {opensPass ? (
          <OsRowAction
            className="collectibles-holding-action"
            aria-label={`${useAction} ${item.title}`}
            onClick={openPass}
          >
            {useAction}
          </OsRowAction>
        ) : null}
        {showOffers ? (
          <OsSheetActions
            layout="row-compact"
            tone="frosted-primary"
            size="sm"
            borderless
            className="market-listing-action"
          >
            <OsSheetAction
              type="button"
              variant="primary"
              ready
              aria-label={offersAriaLabel}
              onClick={() => onOffers?.(item)}
            >
              {offersLabel}
            </OsSheetAction>
          </OsSheetActions>
        ) : null}
        {needsSettle ? (
          <OsSheetActions
            layout="row-compact"
            tone="frosted-primary"
            size="sm"
            borderless
            className="market-listing-action"
          >
            <OsSheetAction
              type="button"
              variant={showOffers ? 'ghost' : 'primary'}
              ready={!settlePending}
              pending={settlePending}
              pendingLabel="Settling…"
              onClick={() => onSettle?.(item)}
            >
              Complete
            </OsSheetAction>
          </OsSheetActions>
        ) : null}
        {showPostCompose ? (
          <OsSheetActions
            layout="row-compact"
            tone="frosted-primary"
            size="sm"
            borderless
            className="market-listing-action"
          >
            <OsSheetAction
              type="button"
              variant="ghost"
              ready
              onClick={() => {
                const collectionId = item.collectionId?.trim() || '';
                requestDropCompose({
                  ...(collectionId ? { collectionId } : {}),
                  tokenId: item.tokenId,
                  title: item.title,
                  ...(item.mediaUrl ? { mediaUrl: item.mediaUrl } : {}),
                  ...(item.mediumKind ? { mediumKind: item.mediumKind } : {}),
                  ...(item.sourcePostPath
                    ? { sourcePostPath: item.sourcePostPath }
                    : {}),
                });
              }}
            >
              Post
            </OsSheetAction>
          </OsSheetActions>
        ) : !listed && showViewSourcePost && sourcePostHref ? (
          <OsSheetActions
            layout="row-compact"
            tone="frosted-primary"
            size="sm"
            borderless
            className="market-listing-action"
          >
            <OsSheetAction
              type="button"
              variant="ghost"
              ready
              onClick={() => {
                if (openMarketPost(sourcePostHref)) return;
                router.push(sourcePostHref);
              }}
            >
              View post
            </OsSheetAction>
          </OsSheetActions>
        ) : null}
      </div>
      {opensPass && passMounted ? (
        <OwnedShowPassSheet
          open={passOpen}
          onClose={() => setPassOpen(false)}
          title={item.title}
          cover={item.mediaUrl}
          collectionId={passCollectionId}
          tokenId={item.tokenId}
        />
      ) : null}
    </div>
  );
}
