'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import type { MarketListingItem } from '@/features/market/market-listings';
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

/** Seed post menu so Market → post shows Cancel, not List, before embed loads. */
function seedListedEmbed(item: MarketListingItem) {
  const coords = sourcePostCoords(item.sourcePostPath);
  if (!coords || !item.listingId) return;
  setScarceEmbedOverride(postScarceKey(coords.author, coords.postId), {
    status: 'lazy_listing',
    listingId: item.listingId,
    priceNear: item.priceNear,
    events: [],
  });
}

const CONFIRM_LEAVE_MS = 4_000;

export function MarketListingRow({
  item,
  isOwnListing = false,
  cancelPending = false,
  onBuy,
  onCancel,
}: MarketListingRowProps) {
  const handle = fallbackLabel(item.creatorId);
  const profileHref = portfolioPath(item.creatorId);
  const postHref = postHrefFromSourcePath(item.sourcePostPath);
  const [confirmListingId, setConfirmListingId] = useState<string | null>(null);
  const confirmTimerRef = useRef<number | null>(null);
  const confirmingCancel =
    confirmListingId === item.listingId && isOwnListing && !cancelPending;

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
    setConfirmListingId(null);
  };

  const handleOwnClick = () => {
    if (cancelPending || !onCancel) return;
    if (!confirmingCancel) {
      setConfirmListingId(item.listingId);
      confirmTimerRef.current = window.setTimeout(() => {
        confirmTimerRef.current = null;
        setConfirmListingId(null);
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
    <div className="market-listing-row">
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
            isOwnListing ? `${item.title} (your listing)` : `Buy ${item.title}`
          }
        >
          {item.mediaUrl ? (
            <img src={item.mediaUrl} alt="" />
          ) : (
            <span className="market-listing-thumb-fallback" aria-hidden />
          )}
        </button>
      )}
      <div className="market-listing-copy">
        <div className="market-listing-head">
          <p className="market-listing-title">{titleNode}</p>
          <p className="market-listing-price">
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
            onClick={() => onBuy(item)}
          >
            Buy
          </OsSheetAction>
        )}
      </OsSheetActions>
    </div>
  );
}
