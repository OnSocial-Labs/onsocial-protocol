'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  OsSheetAction,
  OsSheetActions,
  ProfileAvatar,
} from '@onsocial/ui';
import {
  collectionIdFromTokenId,
  marketListingRowKey,
  formatMarketRelativeTime,
  type MarketListingItem,
} from '@/features/market/market-listings';
import { formatAuctionCountdown } from '@/features/scarces/scarce-auction';
import {
  postScarceKey,
  setScarceEmbedOverride,
} from '@/features/scarces/scarce-embed-ledger';
import { collectionPath } from '@/lib/app-routes';
import { portfolioPath } from '@/lib/overlay-routes';
import { personalPostPath } from '@/lib/post-routes';
import { displayName, fallbackLabel } from '@/lib/profile-display';

interface MarketListingRowProps {
  item: MarketListingItem;
  isOwnListing?: boolean;
  cancelPending?: boolean;
  /** Shared clock for auction countdowns (ms). */
  nowMs?: number;
  /** Highest open offer (NEAR) on this native/auction token. */
  highestOfferNear?: string | null;
  /** Viewer already owns an edition of this drop / source post. */
  alreadyOwnsEdition?: boolean;
  onBuy: (item: MarketListingItem) => void;
  onCancel?: (item: MarketListingItem) => void;
}

function formatPriceNear(priceNear: string): string {
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function sourcePostCoords(
  path: string | undefined
): { author: string; postId: string } | null {
  if (!path?.trim()) return null;
  const match = path.trim().match(/^(.+)\/post\/(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  return { author: match[1], postId: match[2] };
}

function postHrefFromSourcePath(path: string | undefined): string | null {
  const coords = sourcePostCoords(path);
  if (!coords) return null;
  return personalPostPath(coords.author, coords.postId);
}

/** Seed post so Market → post shows Cancel + the Market cover (not a prior card). */
function seedListedEmbed(item: MarketListingItem) {
  const coords = sourcePostCoords(item.sourcePostPath);
  if (!coords || item.kind !== 'lazy' || !item.listingId) return;
  const mediaUrl = item.mediaUrl?.trim() || undefined;
  const cardBg = item.cardBg?.trim() || undefined;
  setScarceEmbedOverride(postScarceKey(coords.author, coords.postId), {
    status: 'lazy_listing',
    listingId: item.listingId,
    priceNear: item.priceNear,
    ...(mediaUrl ? { mediaUrl } : {}),
    ...(cardBg ? { cardBg } : {}),
    ...(item.copies != null ? { copies: item.copies } : {}),
    ...(item.remaining != null ? { remaining: item.remaining } : {}),
    events: [],
  });
}

const CONFIRM_LEAVE_MS = 4_000;

export function MarketListingRow({
  item,
  isOwnListing = false,
  cancelPending = false,
  nowMs,
  highestOfferNear = null,
  alreadyOwnsEdition = false,
  onBuy,
  onCancel,
}: MarketListingRowProps) {
  const rowKey = marketListingRowKey(item);
  const sellerId = item.creatorId;
  // Provenance: distinct mint creator when set, else the seller is the creator.
  const creatorId = item.artistId?.trim() || sellerId;
  const creatorHandle = fallbackLabel(creatorId);
  const creatorHref = portfolioPath(creatorId);
  const creatorLabel = displayName(
    creatorId,
    item.creatorDisplayName ?? undefined
  );
  const creatorNameIsCustom =
    Boolean(creatorLabel) &&
    creatorLabel.toLowerCase() !== creatorHandle.toLowerCase() &&
    creatorLabel.toLowerCase() !== creatorId.trim().toLowerCase();
  const postHref = item.postHref ?? postHrefFromSourcePath(item.sourcePostPath);
  // Social post when listed from a post; else drop page for edition tokens.
  const detailHref =
    postHref ??
    (() => {
      const collectionId = collectionIdFromTokenId(item.tokenId ?? '');
      return collectionId ? collectionPath(collectionId) : null;
    })();
  const [confirmRowKey, setConfirmRowKey] = useState<string | null>(null);
  const confirmTimerRef = useRef<number | null>(null);
  const confirmingCancel =
    confirmRowKey === rowKey && isOwnListing && !cancelPending;
  const auctionCountdown =
    item.kind === 'auction' && typeof nowMs === 'number'
      ? formatAuctionCountdown(item.expiresAtNs ?? null, nowMs)
      : null;
  const bidCount =
    item.kind === 'auction' && item.bidCount != null && item.bidCount > 0
      ? item.bidCount
      : null;
  const auctionClockLabel =
    item.kind !== 'auction'
      ? null
      : auctionCountdown == null
        ? item.expiresAtNs == null
          ? 'Starts on first bid'
          : null
        : auctionCountdown === 'Ended'
          ? 'Ended'
          : `Ends in ${auctionCountdown}`;
  const listedTime = formatMarketRelativeTime(item.blockTimestamp);
  const timeLabel = auctionClockLabel
    ? auctionClockLabel
    : item.kind !== 'auction' && listedTime
      ? `Listed ${listedTime}`
      : null;

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) {
        window.clearTimeout(confirmTimerRef.current);
      }
    };
  }, []);

  const clearConfirm = () => {
    if (confirmTimerRef.current !== null) {
      window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    setConfirmRowKey(null);
  };

  const handleOwnClick = () => {
    if (cancelPending || !onCancel) return;
    if (!confirmingCancel) {
      setConfirmRowKey(rowKey);
      confirmTimerRef.current = window.setTimeout(() => {
        confirmTimerRef.current = null;
        setConfirmRowKey(null);
      }, CONFIRM_LEAVE_MS);
      return;
    }
    clearConfirm();
    onCancel(item);
  };

  const titleNode = detailHref ? (
    <Link
      href={detailHref}
      scroll={false}
      className="market-listing-title-link"
      onClick={() => {
        if (postHref) seedListedEmbed(item);
      }}
    >
      {item.title}
    </Link>
  ) : (
    item.title
  );

  const isPrimaryMint = item.kind === 'lazy';
  const buyLabel =
    item.kind === 'auction'
      ? auctionCountdown === 'Ended'
        ? 'Settle'
        : 'Bid'
      : isPrimaryMint
        ? alreadyOwnsEdition
          ? 'Mint another'
          : 'Mint'
        : alreadyOwnsEdition
          ? 'Buy another'
          : 'Buy';
  const buyAriaLabel =
    item.kind === 'auction'
      ? auctionCountdown === 'Ended'
        ? `Settle auction for ${item.title}`
        : `Bid on ${item.title}`
      : isPrimaryMint
        ? alreadyOwnsEdition
          ? `Mint another ${item.title}`
          : `Mint ${item.title}`
        : alreadyOwnsEdition
          ? `Buy another ${item.title}`
          : `Buy ${item.title}`;

  return (
    <div className="market-listing-row" role="listitem">
      {detailHref ? (
        <Link
          href={detailHref}
          scroll={false}
          className={`market-listing-thumb${item.mediaUrl ? ' has-media' : ''}`}
          aria-label={
            postHref
              ? `Open post for ${item.title}`
              : `Open drop for ${item.title}`
          }
          onClick={() => {
            if (postHref) seedListedEmbed(item);
          }}
        >
          {item.mediaUrl ? (
            <img src={item.mediaUrl} alt="" />
          ) : (
            <span className="market-listing-thumb-fallback" aria-hidden />
          )}
        </Link>
      ) : (
        <button
          type="button"
          className={`market-listing-thumb${item.mediaUrl ? ' has-media' : ''}`}
          onClick={() => {
            if (!isOwnListing) onBuy(item);
          }}
          disabled={isOwnListing}
          aria-label={
            isOwnListing ? `${item.title} (your listing)` : buyAriaLabel
          }
        >
          {item.mediaUrl ? (
            <img src={item.mediaUrl} alt="" />
          ) : (
            <span className="market-listing-thumb-fallback" aria-hidden />
          )}
        </button>
      )}
      <div className="market-listing-copy drops-discovery-copy">
        <div className="market-listing-head drops-discovery-head">
          <p className="market-listing-title">{titleNode}</p>
        </div>
        {/* by Name / @handle — same party chrome as Drops. */}
        <div className="drops-discovery-party">
          <Link
            href={creatorHref}
            scroll={false}
            className="drops-discovery-party-avatar-link"
            tabIndex={creatorNameIsCustom ? -1 : undefined}
            aria-hidden={creatorNameIsCustom ? true : undefined}
            aria-label={
              creatorNameIsCustom ? undefined : `Creator @${creatorHandle}`
            }
          >
            <ProfileAvatar
              src={item.creatorAvatarUrl}
              size="sm"
              fallbackInitial={creatorHandle.slice(0, 1)}
              className="drops-discovery-party-avatar"
            />
          </Link>
          <div className="drops-discovery-party-stack">
            {creatorNameIsCustom ? (
              <Link
                href={creatorHref}
                scroll={false}
                className="drops-discovery-by"
              >
                by {creatorLabel}
              </Link>
            ) : (
              <Link
                href={creatorHref}
                scroll={false}
                className="drops-discovery-by"
              >
                @{creatorHandle}
              </Link>
            )}
            {creatorNameIsCustom ? (
              <span className="drops-discovery-sub">@{creatorHandle}</span>
            ) : null}
          </div>
        </div>
        <p className="market-listing-meta market-listing-meta--price">
          <span className="market-listing-price">
            {item.priceLabel ? `${item.priceLabel} · ` : ''}
            {formatPriceNear(item.priceNear)} NEAR
          </span>
          {bidCount != null ? (
            <span className="market-listing-own">
              {' · '}
              {bidCount === 1 ? '1 bid' : `${bidCount} bids`}
            </span>
          ) : highestOfferNear?.trim() ? (
            <span className="market-listing-own">
              {' · '}
              Offer {formatPriceNear(highestOfferNear)} NEAR
            </span>
          ) : item.kind === 'native' ? (
            <span className="market-listing-own"> · Resale</span>
          ) : isPrimaryMint && !isOwnListing ? (
            <span className="market-listing-own"> · Primary</span>
          ) : isOwnListing ? (
            <span className="market-listing-own"> · Yours</span>
          ) : null}
          {isPrimaryMint &&
          item.copies != null &&
          item.remaining != null &&
          item.remaining >= 0 ? (
            <span className="market-listing-own">
              {' · '}
              {item.remaining} of {item.copies} left
            </span>
          ) : null}
        </p>
      </div>
      <div className="market-listing-action-col">
        {timeLabel ? (
          <p className="market-listing-meta-right">{timeLabel}</p>
        ) : null}
        <OsSheetActions
          layout="row-compact"
          tone="frosted-primary"
          borderless
          className="market-listing-action"
        >
          {isOwnListing ? (
            <OsSheetAction
              type="button"
              variant={confirmingCancel ? 'danger' : 'primary'}
              ready
              pending={cancelPending}
              pendingLabel="Canceling…"
              aria-label={
                cancelPending
                  ? 'Canceling listing'
                  : confirmingCancel
                    ? 'Confirm cancel listing'
                    : 'Cancel listing'
              }
              onClick={handleOwnClick}
              onBlur={confirmingCancel ? clearConfirm : undefined}
            >
              {confirmingCancel ? 'Cancel?' : 'Listed'}
            </OsSheetAction>
          ) : (
            <OsSheetAction
              type="button"
              variant="primary"
              ready
              aria-label={buyAriaLabel}
              onClick={() => onBuy(item)}
            >
              {buyLabel}
            </OsSheetAction>
          )}
        </OsSheetActions>
      </div>
    </div>
  );
}
