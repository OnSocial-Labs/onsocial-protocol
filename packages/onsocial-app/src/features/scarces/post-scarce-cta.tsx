'use client';

import { memo, type ReactNode } from 'react';
import Link from 'next/link';
import type { PostScarceEmbed } from '@onsocial/sdk';
import { dollarStickerLabel } from '@/features/scarces/dollar-price';
import { supplyUnitForMediumKind } from '@/features/scarces/drop-templates';
import {
  isPrimaryMintStatus,
  resolvePostDropCta,
} from '@/features/scarces/post-drop-cta';
import { scarceEmbedCommercePaintReady } from '@/features/scarces/scarce-embed-ledger';
import { seedCollectionViewFromPostScarceEmbed } from '@/features/scarces/collection-page-view';
import { DropOverlayLink } from '@/features/scarces/drop-overlay-open';
import {
  appPath,
  collectionPath,
  marketAppPath,
  marketCreatorPath,
  parseInAppDropLayerHref,
} from '@/lib/app-routes';

/** Commerce data + actions every PostScarceCta host wires the same way. */
export type PostScarceCtaActionProps = {
  embed: PostScarceEmbed;
  /** Hide Buy / Bid when the viewer authored the post. */
  isAuthor?: boolean;
  /** Author account — used for Market deep links. */
  authorAccountId?: string;
  /** Catalog title when the embed already resolved one. */
  dropTitle?: string | null;
  /** Author can list when status is none / minted (no active listing). */
  canList?: boolean;
  onList?: () => void;
  /** Viewer owns an edition of this post’s scarce (unlisted). */
  canSell?: boolean;
  onSell?: () => void;
  /** Viewer can send this edition to another account. */
  canTransfer?: boolean;
  onTransfer?: () => void;
  /** Viewer owns an edition and it is already listed for resale. */
  sellListed?: boolean;
  /**
   * Viewer already owns an edition — used by drawer / Market for “another”.
   * Post CTA stays Mint/Buy regardless.
   */
  alreadyOwnsEdition?: boolean;
  onBuy: () => void;
  onBid?: () => void;
};

export type PostScarceCtaProps = PostScarceCtaActionProps & {
  /** Compact Read (or other medium) control beside commerce CTAs. */
  mediumSlot?: ReactNode;
};

/** Structure seat while drop commerce soft-fills after the jacket. */
export function PostScarceCtaPending() {
  return (
    <div
      className="post-card-scarce-cta post-card-scarce-cta--pending"
      aria-hidden
    >
      <span className="standing-row-shimmer post-row-skeleton-line-sm" />
    </div>
  );
}

function primaryMintLive(embed: PostScarceEmbed): boolean {
  if (embed.status === 'lazy_listing' && Boolean(embed.listingId?.trim())) {
    return embed.remaining == null || embed.remaining > 0;
  }
  if (embed.status === 'drop') {
    const collectionId =
      embed.collectionId?.trim() || embed.latest?.collectionId?.trim();
    if (!collectionId) return false;
    return embed.remaining == null || embed.remaining > 0;
  }
  return false;
}

function formatPriceNear(priceNear: string | null | undefined): string | null {
  if (!priceNear?.trim()) return null;
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear.trim();
  if (n >= 1000) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/**
 * Feed CTA price unit. Dollars when the listing stores `usdE6`, else NEAR.
 * Ledger stick keeps the painted unit fixed under quiet refresh.
 */
export function scarceCtaPriceLabel(embed: {
  usdE6?: string | null;
  priceNear?: string | null;
}): string | null {
  const dollars = dollarStickerLabel(embed.usdE6);
  if (dollars) return dollars;
  const nearPrice = formatPriceNear(embed.priceNear);
  return nearPrice ? `${nearPrice} NEAR` : null;
}

export { scarceEmbedCommercePaintReady };

export type ScarcePostCtaPhase = 'live' | 'pending' | 'hidden';

/**
 * Feed commerce slot. A settled `none` seed (delisted token or collection)
 * is not an ask still loading — render no seat.
 */
export function scarcePostCtaPhase(input: {
  isRepostShell: boolean;
  embed: PostScarceEmbed | null | undefined;
  hasDropPaint: boolean;
  hasCollectionEmbed: boolean;
  hasTokenEmbed: boolean;
  canListScarce: boolean;
}): ScarcePostCtaPhase {
  if (input.isRepostShell) return 'hidden';
  const commerceReady = scarceEmbedCommercePaintReady(input.embed);
  const jacketKnown =
    input.hasDropPaint ||
    input.hasCollectionEmbed ||
    input.hasTokenEmbed ||
    (input.embed != null && input.embed.status !== 'none');
  const live =
    commerceReady ||
    (input.canListScarce && (!input.embed || input.embed.status === 'none'));
  if (live) return 'live';
  // Settled `none` (delisted token or collection) is not an ask still loading.
  if (input.embed?.status === 'none') return 'hidden';
  if (jacketKnown && !commerceReady) return 'pending';
  return 'hidden';
}

function editionMeta(embed: PostScarceEmbed): string | null {
  if (embed.copies == null || embed.copies <= 1) return null;
  if (embed.remaining != null) {
    return `${embed.remaining}/${embed.copies} left`;
  }
  return `${embed.copies} ${supplyUnitForMediumKind(embed.mediumKind).unit}`;
}

/** Quiet secondary-market cue: listed/auction edition (not primary mint). */
export function isResaleEmbed(embed: PostScarceEmbed): boolean {
  return Boolean(
    embed.tokenId?.trim() &&
      (embed.status === 'listed' || embed.status === 'auction')
  );
}

function ResaleMeta({ embed }: { embed: PostScarceEmbed }) {
  if (!isResaleEmbed(embed)) return null;
  return <span className="post-card-scarce-cta-meta">Resale</span>;
}

function BuyMetaRow({
  embed,
  edition,
  className = 'post-card-scarce-buy-meta',
}: {
  embed: PostScarceEmbed;
  edition: string | null;
  className?: string;
}) {
  const resale = isResaleEmbed(embed);
  if (!edition && !resale) return null;
  if (edition && resale) {
    return <span className={className}>{edition} · Resale</span>;
  }
  if (edition) {
    return <span className={className}>{edition}</span>;
  }
  return <span className={className}>Resale</span>;
}

function commerceLinks(
  embed: PostScarceEmbed,
  authorAccountId?: string
): { href: string; label: string }[] {
  const links: { href: string; label: string }[] = [];
  const collectionId =
    embed.collectionId?.trim() || embed.latest?.collectionId?.trim();
  const appId = embed.appId?.trim() || embed.latest?.appId?.trim();
  // Drop link only for real collections — never invent one for lazy listings.
  // Series stays on the drop page, under the creator.
  if (collectionId) {
    links.push({ href: collectionPath(collectionId), label: 'Drop' });
  }
  if (appId) {
    links.push({ href: appPath(appId), label: 'Hub' });
  }
  // Market for listing commerce only — not the home for primary Drop mints.
  if (embed.status === 'drop') {
    return links;
  }
  if (appId) {
    links.push({ href: marketAppPath(appId), label: 'Market' });
  } else if (
    authorAccountId?.trim() &&
    (embed.status === 'lazy_listing' ||
      embed.status === 'listed' ||
      embed.status === 'auction' ||
      embed.status === 'sold' ||
      embed.status === 'minted')
  ) {
    links.push({
      href: marketCreatorPath(authorAccountId),
      label: 'Market',
    });
  }
  return links;
}

function CommerceLinkRow({
  links,
  dropInitial,
}: {
  links: { href: string; label: string }[];
  dropInitial?: ReturnType<typeof seedCollectionViewFromPostScarceEmbed>;
}) {
  if (links.length === 0) return null;
  return (
    <div className="post-card-scarce-links">
      {links.map((link) => {
        const drop = parseInAppDropLayerHref(link.href);
        if (drop) {
          return (
            <DropOverlayLink
              key={`${link.label}:${link.href}`}
              collectionId={drop.collectionId}
              initial={dropInitial}
              className="post-card-scarce-link"
              onClick={(event) => event.stopPropagation()}
            >
              {link.label}
            </DropOverlayLink>
          );
        }
        return (
          <Link
            key={`${link.label}:${link.href}`}
            href={link.href}
            className="post-card-scarce-link"
            scroll={false}
            onClick={(event) => event.stopPropagation()}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}

function DropPageLink({
  collectionId,
  dropInitial,
}: {
  collectionId: string;
  dropInitial?: ReturnType<typeof seedCollectionViewFromPostScarceEmbed>;
}) {
  return (
    <DropOverlayLink
      collectionId={collectionId}
      initial={dropInitial}
      className="post-card-scarce-link"
      onClick={(event) => event.stopPropagation()}
    >
      Drop
    </DropOverlayLink>
  );
}

/** Drop is already the action, so the quiet Drop link would repeat it. */
function linksBesideDropAction(
  links: { href: string; label: string }[]
): { href: string; label: string }[] {
  return links.filter((link) => link.label !== 'Drop');
}

/**
 * One-line commerce CTA under post media / above engagement.
 * Vocabulary: Mint · Buy · Sell · Drop · List (Amplify lives in engagement row).
 */
export const PostScarceCta = memo(function PostScarceCta({
  embed,
  isAuthor = false,
  authorAccountId,
  dropTitle = null,
  canList = false,
  onList,
  canSell = false,
  onSell,
  canTransfer = false,
  onTransfer,
  sellListed = false,
  onBuy,
  onBid,
  mediumSlot = null,
}: PostScarceCtaProps) {
  const links = commerceLinks(embed, authorAccountId);
  const price = scarceCtaPriceLabel(embed);
  const edition = editionMeta(embed);
  const collectionId =
    embed.collectionId?.trim() || embed.latest?.collectionId?.trim() || '';
  const dropInitial = seedCollectionViewFromPostScarceEmbed(embed, {
    title: dropTitle,
  });
  const primaryLive = primaryMintLive(embed);
  const isDropFamily =
    Boolean(collectionId) &&
    (embed.status === 'drop' ||
      embed.status === 'sold' ||
      embed.status === 'minted' ||
      ((embed.status === 'listed' || embed.status === 'auction') &&
        Boolean(embed.tokenId)));

  if (embed.status === 'none') {
    if (isAuthor && canList && onList) {
      return (
        <div className="post-card-scarce-cta">
          <button
            type="button"
            className="post-card-scarce-buy post-card-scarce-buy--secondary"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onList();
            }}
          >
            <span className="post-card-scarce-buy-main">List</span>
          </button>
        </div>
      );
    }
    return null;
  }

  // Holder resale only when primary mint is no longer live — otherwise keep
  // Mint so the source post stays the primary product.
  if (!primaryLive && canSell && onSell) {
    return (
      <div className="post-card-scarce-cta">
        {canTransfer && onTransfer ? (
          <button
            type="button"
            className="post-card-scarce-buy post-card-scarce-buy--secondary"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onTransfer();
            }}
          >
            <span className="post-card-scarce-buy-main">Transfer</span>
          </button>
        ) : null}
        <button
          type="button"
          className="post-card-scarce-buy post-card-scarce-buy--secondary"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSell();
          }}
        >
          <span className="post-card-scarce-buy-main">Sell</span>
        </button>
        {mediumSlot}
        <CommerceLinkRow links={links} dropInitial={dropInitial} />
      </div>
    );
  }

  if (!primaryLive && sellListed && canTransfer && onTransfer) {
    return (
      <div className="post-card-scarce-cta">
        <button
          type="button"
          className="post-card-scarce-buy post-card-scarce-buy--secondary"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onTransfer();
          }}
        >
          <span className="post-card-scarce-buy-main">Transfer</span>
        </button>
        <span className="post-card-scarce-cta-main">Listed</span>
        {mediumSlot}
        <CommerceLinkRow links={links} dropInitial={dropInitial} />
      </div>
    );
  }

  if (!primaryLive && sellListed) {
    return (
      <div className="post-card-scarce-cta post-card-scarce-cta--muted">
        <span className="post-card-scarce-cta-main">Listed</span>
        {mediumSlot}
        <CommerceLinkRow links={links} dropInitial={dropInitial} />
      </div>
    );
  }

  if (isDropFamily) {
    const dropCta = resolvePostDropCta({ embed, isPostAuthor: isAuthor });
    if (dropCta.kind === 'muted') {
      return (
        <div className="post-card-scarce-cta post-card-scarce-cta--muted">
          <span className="post-card-scarce-cta-main">
            {price ? `${dropCta.mutedLabel} · ${price}` : dropCta.mutedLabel}
          </span>
          {edition ? (
            <span className="post-card-scarce-cta-meta">{edition}</span>
          ) : null}
          <ResaleMeta embed={embed} />
          {mediumSlot}
          <CommerceLinkRow links={links} dropInitial={dropInitial} />
        </div>
      );
    }
    if (dropCta.kind === 'open') {
      return (
        <div className="post-card-scarce-cta">
          {collectionId ? (
            <DropPageLink
              collectionId={collectionId}
              dropInitial={dropInitial}
            />
          ) : null}
          {mediumSlot}
          <CommerceLinkRow
            links={linksBesideDropAction(links)}
            dropInitial={dropInitial}
          />
        </div>
      );
    }
    if (dropCta.kind === 'bid') {
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
              {price ? `Bid · ${price}` : 'Bid'}
            </span>
            <BuyMetaRow embed={embed} edition={edition} />
          </button>
          {mediumSlot}
          <CommerceLinkRow links={links} dropInitial={dropInitial} />
        </div>
      );
    }
    // mint | buy — post stays short; “another” lives in drawer / Market.
    const mintVerb = dropCta.kind === 'mint' ? 'Mint' : 'Buy';
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
            {price ? `${mintVerb} · ${price}` : mintVerb}
          </span>
          {dropCta.kind === 'mint' ? (
            edition ? (
              <span className="post-card-scarce-buy-meta">{edition}</span>
            ) : null
          ) : (
            <BuyMetaRow embed={embed} edition={edition} />
          )}
        </button>
        {mediumSlot}
        <CommerceLinkRow links={links} dropInitial={dropInitial} />
      </div>
    );
  }

  if (embed.status === 'minted') {
    return (
      <div className="post-card-scarce-cta post-card-scarce-cta--muted">
        <span className="post-card-scarce-cta-main">Owned</span>
        {mediumSlot}
        <CommerceLinkRow links={links} dropInitial={dropInitial} />
        {isAuthor && canList && onList ? (
          <button
            type="button"
            className="post-card-scarce-buy post-card-scarce-buy--secondary"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onList();
            }}
          >
            <span className="post-card-scarce-buy-main">List</span>
          </button>
        ) : null}
      </div>
    );
  }

  if (embed.status === 'sold') {
    return (
      <div className="post-card-scarce-cta post-card-scarce-cta--sold">
        <span>Sold</span>
        {mediumSlot}
        <CommerceLinkRow links={links} dropInitial={dropInitial} />
      </div>
    );
  }

  if (embed.status === 'auction') {
    const canBid = !isAuthor && Boolean(embed.tokenId) && Boolean(onBid);
    if (isAuthor) {
      return (
        <div className="post-card-scarce-cta post-card-scarce-cta--muted">
          <span className="post-card-scarce-cta-main">
            {price ? `Auction · ${price}` : 'Your auction'}
          </span>
          <ResaleMeta embed={embed} />
          {mediumSlot}
          <CommerceLinkRow links={links} dropInitial={dropInitial} />
        </div>
      );
    }
    if (!canBid) {
      return (
        <div className="post-card-scarce-cta post-card-scarce-cta--muted">
          <span className="post-card-scarce-cta-main">
            {price ? `Auction · ${price}…` : 'Auction…'}
          </span>
          <ResaleMeta embed={embed} />
          {mediumSlot}
          <CommerceLinkRow links={links} dropInitial={dropInitial} />
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
            {price ? `Bid · ${price}` : 'Bid'}
          </span>
          <BuyMetaRow embed={embed} edition={edition} />
        </button>
        {mediumSlot}
        <CommerceLinkRow links={links} dropInitial={dropInitial} />
      </div>
    );
  }

  const isLazyMint =
    embed.status === 'lazy_listing' && Boolean(embed.listingId);
  const isSecondaryBuy = embed.status === 'listed' && Boolean(embed.tokenId);
  const canCommerce = !isAuthor && (isLazyMint || isSecondaryBuy);
  const primaryIsMint = isPrimaryMintStatus(embed.status);

  if (isAuthor) {
    return (
      <div className="post-card-scarce-cta post-card-scarce-cta--muted">
        <span className="post-card-scarce-cta-main">
          {embed.status === 'lazy_listing'
            ? price
              ? `Your Drop · ${price}`
              : 'Your Drop'
            : price
              ? `Yours · ${price}`
              : 'Yours'}
        </span>
        {edition ? (
          <span className="post-card-scarce-cta-meta">{edition}</span>
        ) : null}
        <ResaleMeta embed={embed} />
        {mediumSlot}
        <CommerceLinkRow links={links} dropInitial={dropInitial} />
      </div>
    );
  }

  if (!canCommerce) {
    return (
      <div className="post-card-scarce-cta post-card-scarce-cta--muted">
        <span className="post-card-scarce-cta-main">
          {primaryIsMint
            ? price
              ? `Drop · ${price}…`
              : 'Drop…'
            : price
              ? `Listing · ${price}…`
              : 'Listing…'}
        </span>
        <ResaleMeta embed={embed} />
        {mediumSlot}
        <CommerceLinkRow links={links} dropInitial={dropInitial} />
      </div>
    );
  }

  // Post CTA stays Mint/Buy; drawer + Market keep “another” when owned.
  const commerceVerb = primaryIsMint ? 'Mint' : 'Buy';

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
          {price ? `${commerceVerb} · ${price}` : commerceVerb}
        </span>
        {primaryIsMint ? (
          edition ? (
            <span className="post-card-scarce-buy-meta">{edition}</span>
          ) : null
        ) : (
          <BuyMetaRow embed={embed} edition={edition} />
        )}
      </button>
      {mediumSlot}
      <CommerceLinkRow links={links} dropInitial={dropInitial} />
    </div>
  );
});
