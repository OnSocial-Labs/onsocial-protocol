'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  OsSheetAction,
  OsSheetActions,
} from '@onsocial/ui';
import {
  auctionExpiresAtMs,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { requestDropCompose } from '@/features/scarces/drop-compose-draft';
import {
  holdingsActionLabel,
  holdingsHrefForOwned,
} from '@/lib/portfolio-holdings';
import { postHrefFromSourcePath } from '@/lib/scarce-creator-earnings';

interface MarketOwnedRowProps {
  item: OwnedScarceItem;
  delistPending?: boolean;
  settlePending?: boolean;
  /** Highest open offer (NEAR), when known from the offers catalog. */
  highestOfferNear?: string | null;
  offerCount?: number;
  /** Clock for ended-auction settle CTA. */
  nowMs?: number;
  onSell: (item: OwnedScarceItem) => void;
  onDelist: (item: OwnedScarceItem) => void;
  onSettle?: (item: OwnedScarceItem) => void;
  onOffers?: (item: OwnedScarceItem) => void;
}

function formatPriceNear(priceNear: string): string {
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

const CONFIRM_LEAVE_MS = 4_000;

/** Owned scarce in Market “Yours” — Sell/Delist; Post when listed (Drop or resale). */
export function MarketOwnedRow({
  item,
  delistPending = false,
  settlePending = false,
  highestOfferNear = null,
  offerCount = 0,
  nowMs,
  onSell,
  onDelist,
  onSettle,
  onOffers,
}: MarketOwnedRowProps) {
  const router = useRouter();
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
  const offersLabel = offerCount > 1 ? 'Offers' : 'Offer';
  const offersAriaLabel = highestOfferNear?.trim()
    ? offerCount > 1
      ? `Offers, top ${formatPriceNear(highestOfferNear)} NEAR`
      : `Offer ${formatPriceNear(highestOfferNear)} NEAR`
    : offersLabel;
  const [confirmTokenId, setConfirmTokenId] = useState<string | null>(null);
  const confirmTimerRef = useRef<number | null>(null);
  const confirmingDelist =
    confirmTokenId === item.tokenId && listed && !delistPending && !needsSettle;

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
    listed &&
    Boolean(item.collectionId?.trim() || item.tokenId?.trim());
  const showListedAction = needsSettle || !listed || !auctionHasBids;
  const [brokenMediaUrl, setBrokenMediaUrl] = useState<string | null>(null);
  const showThumb = Boolean(item.mediaUrl) && brokenMediaUrl !== item.mediaUrl;

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
    setConfirmTokenId(null);
  };

  const handleDelistClick = () => {
    if (delistPending || settlePending) return;
    if (!confirmingDelist) {
      setConfirmTokenId(item.tokenId);
      confirmTimerRef.current = window.setTimeout(() => {
        confirmTimerRef.current = null;
        setConfirmTokenId(null);
      }, CONFIRM_LEAVE_MS);
      return;
    }
    clearConfirm();
    onDelist(item);
  };

  const thumb = showThumb ? (
    <img
      src={item.mediaUrl!}
      alt=""
      onError={() => setBrokenMediaUrl(item.mediaUrl ?? null)}
    />
  ) : (
    <span className="market-listing-thumb-fallback" aria-hidden />
  );

  const title = useHref ? (
    <Link href={useHref} scroll={false} className="market-listing-title-link">
      {item.title}
    </Link>
  ) : (
    item.title
  );

  return (
    <div className="market-listing-row" role="listitem">
      {useHref ? (
        <Link
          href={useHref}
          scroll={false}
          className={`market-listing-thumb${showThumb ? ' has-media' : ''}`}
          aria-label={`${useAction} ${item.title}`}
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
      <div className="market-listing-copy">
        <div className="market-listing-head">
          <p className="market-listing-title">{title}</p>
        </div>
        <p className="market-listing-meta">
          {listed && item.listedPriceNear ? (
            <>
              <span className="market-listing-price">
                {auction ? 'Reserve' : 'Ask'} ·{' '}
                {formatPriceNear(item.listedPriceNear)} NEAR
              </span>
              <span className="market-listing-own"> · </span>
            </>
          ) : null}
          {auction ? (
            <span className="market-listing-own">
              {needsSettle
                ? `${item.bidCount === 1 ? '1 bid' : `${item.bidCount} bids`} · ended`
                : auctionHasBids
                  ? `${item.bidCount === 1 ? '1 bid' : `${item.bidCount} bids`} · live`
                  : 'Auction live'}
            </span>
          ) : listed ? (
            <span className="market-listing-own">Listed</span>
          ) : (
            <span className="market-listing-own">Ready to sell</span>
          )}
          {showOffers ? (
            <span className="market-listing-own">
              {' · '}
              {offerCount === 1
                ? `Offer ${formatPriceNear(highestOfferNear!)} NEAR`
                : `${offerCount} offers · top ${formatPriceNear(highestOfferNear!)} NEAR`}
            </span>
          ) : null}
        </p>
      </div>
      <div className="market-listing-action-col">
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
        {showListedAction ? (
          <OsSheetActions
            layout="row-compact"
            tone="frosted-primary"
            size="sm"
            borderless
            className="market-listing-action"
          >
            {needsSettle ? (
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
            ) : listed ? (
              <OsSheetAction
                type="button"
                variant={
                  confirmingDelist ? 'danger' : showOffers ? 'ghost' : 'primary'
                }
                ready={!delistPending}
                pending={delistPending}
                pendingLabel={auction ? 'Canceling…' : 'Delisting…'}
                aria-label={
                  delistPending
                    ? auction
                      ? 'Canceling auction'
                      : 'Delisting'
                    : confirmingDelist
                      ? auction
                        ? 'Confirm cancel auction'
                        : 'Confirm delist'
                      : auction
                        ? 'Cancel auction'
                        : 'Delist'
                }
                onClick={handleDelistClick}
                onBlur={confirmingDelist ? clearConfirm : undefined}
              >
                {confirmingDelist
                  ? auction
                    ? 'Cancel?'
                    : 'Delist?'
                  : auction
                    ? 'Cancel auction'
                    : 'Delist'}
              </OsSheetAction>
            ) : (
              <OsSheetAction
                type="button"
                variant={showOffers ? 'ghost' : 'primary'}
                ready
                onClick={() => onSell(item)}
              >
                Sell
              </OsSheetAction>
            )}
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
                  ...(item.mediumKind
                    ? { mediumKind: item.mediumKind }
                    : {}),
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
                router.push(sourcePostHref);
              }}
            >
              View post
            </OsSheetAction>
          </OsSheetActions>
        ) : null}
      </div>
    </div>
  );
}
