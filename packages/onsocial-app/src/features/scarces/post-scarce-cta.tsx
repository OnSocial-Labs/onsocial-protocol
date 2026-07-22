'use client';

import type { PostScarceEmbed } from '@onsocial/sdk';

interface PostScarceCtaProps {
  embed: PostScarceEmbed;
  /** Hide Buy / Bid when the viewer authored the post. */
  isAuthor?: boolean;
  onBuy: () => void;
  onBid?: () => void;
}

function formatPriceNear(priceNear: string | undefined): string | null {
  if (!priceNear?.trim()) return null;
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear.trim();
  if (n >= 1000) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function editionMeta(embed: PostScarceEmbed): string | null {
  if (embed.copies == null || embed.copies <= 1) return null;
  if (embed.remaining != null) {
    return `${embed.remaining}/${embed.copies} left`;
  }
  return `${embed.copies} editions`;
}

/**
 * One-line commerce CTA under post media / above engagement.
 * Only renders when the post has an actionable or terminal scarce state.
 */
export function PostScarceCta({
  embed,
  isAuthor = false,
  onBuy,
  onBid,
}: PostScarceCtaProps) {
  if (embed.status === 'none' || embed.status === 'minted') return null;

  if (embed.status === 'sold') {
    return (
      <div className="post-card-scarce-cta post-card-scarce-cta--sold">
        <span>Sold</span>
      </div>
    );
  }

  const price = formatPriceNear(embed.priceNear);
  const edition = editionMeta(embed);

  if (embed.status === 'auction') {
    const canBid = !isAuthor && Boolean(embed.tokenId) && Boolean(onBid);
    if (isAuthor) {
      return (
        <div className="post-card-scarce-cta post-card-scarce-cta--muted">
          <span className="post-card-scarce-cta-main">
            {price ? `Auction · ${price} NEAR` : 'Your auction'}
          </span>
        </div>
      );
    }
    if (!canBid) {
      return (
        <div className="post-card-scarce-cta post-card-scarce-cta--muted">
          <span className="post-card-scarce-cta-main">
            {price ? `Auction · ${price} NEAR…` : 'Auction…'}
          </span>
        </div>
      );
    }
    return (
      <div className="post-card-scarce-cta">
        <button
          type="button"
          className="post-card-scarce-buy"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onBid?.();
          }}
        >
          <span className="post-card-scarce-buy-main">
            {price ? `Bid · ${price} NEAR` : 'Bid'}
          </span>
        </button>
      </div>
    );
  }

  const canBuy =
    !isAuthor &&
    ((embed.status === 'lazy_listing' && Boolean(embed.listingId)) ||
      (embed.status === 'listed' && Boolean(embed.tokenId)));

  if (isAuthor) {
    return (
      <div className="post-card-scarce-cta post-card-scarce-cta--muted">
        <span className="post-card-scarce-cta-main">
          {price ? `Yours · ${price} NEAR` : 'Yours'}
        </span>
        {edition ? (
          <span className="post-card-scarce-cta-meta">{edition}</span>
        ) : null}
      </div>
    );
  }

  if (!canBuy) {
    return (
      <div className="post-card-scarce-cta post-card-scarce-cta--muted">
        <span className="post-card-scarce-cta-main">
          {price ? `Listing · ${price} NEAR…` : 'Listing…'}
        </span>
      </div>
    );
  }

  return (
    <div className="post-card-scarce-cta">
      <button
        type="button"
        className="post-card-scarce-buy"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onBuy();
        }}
      >
        <span className="post-card-scarce-buy-main">
          {price ? `Buy · ${price} NEAR` : 'Buy'}
        </span>
        {edition ? (
          <span className="post-card-scarce-buy-meta">{edition}</span>
        ) : null}
      </button>
    </div>
  );
}
