'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import {
  marketListingRowKey,
  formatMarketRelativeTime,
  type MarketListingItem,
} from '@/features/market/market-listings';
import { formatAuctionCountdown } from '@/features/scarces/scarce-auction';
import {
  postScarceKey,
  setScarceEmbedOverride,
} from '@/features/scarces/scarce-embed-ledger';
import { portfolioPath } from '@/lib/overlay-routes';
import { personalPostPath } from '@/lib/post-routes';
import { fallbackLabel } from '@/lib/profile-display';

interface MarketListingRowProps {
  item: MarketListingItem;
  isOwnListing?: boolean;
  cancelPending?: boolean;
  /** Shared clock for auction countdowns (ms). */
  nowMs?: number;
  /** Highest open offer (NEAR) on this native/auction token. */
  highestOfferNear?: string | null;
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
  onBuy,
  onCancel,
}: MarketListingRowProps) {
  const rowKey = marketListingRowKey(item);
  const handle = fallbackLabel(item.creatorId);
  const profileHref = portfolioPath(item.creatorId);
  const postHref = item.postHref ?? postHrefFromSourcePath(item.sourcePostPath);
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

  const titleNode = postHref ? (
    <Link
      href={postHref}
      scroll={false}
      className="market-listing-title-link"
      onClick={() => seedListedEmbed(item)}
    >
      {item.title}
    </Link>
  ) : (
    item.title
  );

  return (
    <div className="market-listing-row" role="listitem">
      {postHref ? (
        <Link
          href={postHref}
          scroll={false}
          className={`market-listing-thumb${item.mediaUrl ? ' has-media' : ''}`}
          aria-label={`Open post for ${item.title}`}
          onClick={() => seedListedEmbed(item)}
        >
          {item.mediaUrl ? (
            <img src={item.mediaUrl} alt="" />
          ) : (
            <span className="market-listing-thumb-fallback" aria-hidden />
          )}
          {item.playable ? (
            <span className="market-listing-thumb-play" aria-hidden />
          ) : null}
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
            isOwnListing
              ? `${item.title} (your listing)`
              : item.kind === 'auction'
                ? `Bid on ${item.title}`
                : `Buy ${item.title}`
          }
        >
          {item.mediaUrl ? (
            <img src={item.mediaUrl} alt="" />
          ) : (
            <span className="market-listing-thumb-fallback" aria-hidden />
          )}
          {item.playable ? (
            <span className="market-listing-thumb-play" aria-hidden />
          ) : null}
        </button>
      )}
      <div className="market-listing-copy">
        <div className="market-listing-head">
          <p className="market-listing-title">{titleNode}</p>
          <p className="market-listing-price">
            {item.priceLabel ? `${item.priceLabel} · ` : ''}
            {formatPriceNear(item.priceNear)} NEAR
          </p>
        </div>
        <p className="market-listing-meta">
          <Link
            href={profileHref}
            scroll={false}
            className="market-listing-handle"
          >
            @{handle}
          </Link>
          {item.kind === 'native' ? (
            <span className="market-listing-own"> · Resale</span>
          ) : null}
          {item.kind === 'auction' ? (
            <span className="market-listing-own"> · Auction</span>
          ) : null}
          {item.kind === 'auction' && item.buyNowNear ? (
            <span className="market-listing-own">
              {' · '}
              Buy now {formatPriceNear(item.buyNowNear)} NEAR
            </span>
          ) : null}
          {bidCount != null ? (
            <span className="market-listing-own">
              {' · '}
              {bidCount === 1 ? '1 bid' : `${bidCount} bids`}
            </span>
          ) : null}
          {highestOfferNear?.trim() &&
          (item.kind === 'native' || item.kind === 'auction') ? (
            <span className="market-listing-own">
              {' · '}
              Offer {formatPriceNear(highestOfferNear)} NEAR
            </span>
          ) : null}
          {auctionClockLabel ? (
            <span className="market-listing-own">
              {' · '}
              {auctionClockLabel}
            </span>
          ) : null}
          {listedTime ? (
            <span className="market-listing-own">
              {' · '}
              Listed {listedTime}
            </span>
          ) : null}
          {isOwnListing ? (
            <span className="market-listing-own"> · Yours</span>
          ) : null}
          {item.copies != null && item.copies > 1 ? (
            <span className="market-listing-own">
              {' · '}
              {item.remaining != null && item.remaining < item.copies
                ? `${item.remaining} of ${item.copies} left`
                : `${item.copies} copies`}
            </span>
          ) : null}
        </p>
      </div>
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
            ready={!confirmingCancel}
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
            aria-label={
              item.kind === 'auction'
                ? auctionCountdown === 'Ended'
                  ? `Settle auction for ${item.title}`
                  : `Bid on ${item.title}`
                : `Buy ${item.title}`
            }
            onClick={() => onBuy(item)}
          >
            {item.kind === 'auction'
              ? auctionCountdown === 'Ended'
                ? 'Settle'
                : 'Bid'
              : 'Buy'}
          </OsSheetAction>
        )}
      </OsSheetActions>
    </div>
  );
}
