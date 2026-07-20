'use client';

import type { PostScarceEmbed } from '@onsocial/sdk';

interface PostScarceCtaProps {
  embed: PostScarceEmbed;
  /** Hide Buy when the viewer authored the post. */
  isAuthor?: boolean;
  onBuy: () => void;
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

/**
 * One-line commerce CTA under post media / above engagement.
 * Only renders when the post has an actionable or terminal scarce state.
 */
export function PostScarceCta({
  embed,
  isAuthor = false,
  onBuy,
}: PostScarceCtaProps) {
  if (embed.status === 'none' || embed.status === 'minted') return null;

  if (embed.status === 'sold') {
    return (
      <div className="post-card-scarce-cta post-card-scarce-cta--sold">
        <span>Sold</span>
      </div>
    );
  }

  if (embed.status === 'auction') {
    return (
      <div className="post-card-scarce-cta post-card-scarce-cta--muted">
        <span>Auction</span>
      </div>
    );
  }

  const price = formatPriceNear(embed.priceNear);
  const editionHint =
    embed.copies != null &&
    embed.copies > 1 &&
    embed.remaining != null &&
    embed.remaining < embed.copies
      ? `${embed.remaining}/${embed.copies}`
      : null;
  const canBuy =
    !isAuthor &&
    ((embed.status === 'lazy_listing' && Boolean(embed.listingId)) ||
      (embed.status === 'listed' && Boolean(embed.tokenId)));

  if (isAuthor) {
    return (
      <div className="post-card-scarce-cta post-card-scarce-cta--muted">
        <span>
          {price ? `Yours · ${price} NEAR` : 'Yours'}
          {editionHint ? ` · ${editionHint} left` : ''}
        </span>
      </div>
    );
  }

  if (!canBuy) {
    return (
      <div className="post-card-scarce-cta post-card-scarce-cta--muted">
        <span>{price ? `Listing · ${price} NEAR…` : 'Listing…'}</span>
      </div>
    );
  }

  const label = price
    ? editionHint
      ? `Buy · ${price} NEAR · ${editionHint}`
      : `Buy · ${price} NEAR`
    : editionHint
      ? `Buy · ${editionHint}`
      : 'Buy';

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
        {label}
      </button>
    </div>
  );
}
