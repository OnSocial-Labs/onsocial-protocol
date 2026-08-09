'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { PostScarceEmbed } from '@onsocial/sdk';
import {
  isPrimaryMintStatus,
  resolvePostDropCta,
} from '@/features/scarces/post-drop-cta';
import {
  appPath,
  collectionPath,
  marketAppPath,
  marketCreatorPath,
  seriesPagePath,
} from '@/lib/app-routes';

interface PostScarceCtaProps {
  embed: PostScarceEmbed;
  /** Hide Buy / Bid when the viewer authored the post. */
  isAuthor?: boolean;
  /** Author account — used for Market deep links. */
  authorAccountId?: string;
  /** Author can list when status is none / minted (no active listing). */
  canList?: boolean;
  onList?: () => void;
  onBuy: () => void;
  onBid?: () => void;
  /** Compact Listen control rendered beside commerce CTAs when playable. */
  listenSlot?: ReactNode;
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

function commerceLinks(
  embed: PostScarceEmbed,
  authorAccountId?: string
): { href: string; label: string }[] {
  const links: { href: string; label: string }[] = [];
  const collectionId =
    embed.collectionId?.trim() || embed.latest?.collectionId?.trim();
  const appId = embed.appId?.trim() || embed.latest?.appId?.trim();
  const seriesId = embed.seriesId?.trim();
  // Drop link only for real collections — never invent one for lazy listings.
  if (collectionId) {
    links.push({ href: collectionPath(collectionId), label: 'Drop' });
  }
  if (seriesId && authorAccountId?.trim()) {
    links.push({
      href: seriesPagePath(authorAccountId, seriesId),
      label: embed.seriesTitle?.trim() || 'Series',
    });
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
}: {
  links: { href: string; label: string }[];
}) {
  if (links.length === 0) return null;
  return (
    <div className="post-card-scarce-links">
      {links.map((link) => (
        <Link
          key={`${link.label}:${link.href}`}
          href={link.href}
          className="post-card-scarce-link"
          scroll={false}
          onClick={(event) => event.stopPropagation()}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

function OpenDropButton({ collectionId }: { collectionId: string }) {
  return (
    <Link
      href={collectionPath(collectionId)}
      className="post-card-scarce-buy"
      scroll={false}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="post-card-scarce-buy-main">Open Drop</span>
    </Link>
  );
}

/**
 * One-line commerce CTA under post media / above engagement.
 * Vocabulary: Mint · Buy · Open Drop · List (Amplify lives in engagement row).
 */
export function PostScarceCta({
  embed,
  isAuthor = false,
  authorAccountId,
  canList = false,
  onList,
  onBuy,
  onBid,
  listenSlot = null,
}: PostScarceCtaProps) {
  const links = commerceLinks(embed, authorAccountId);
  const price = formatPriceNear(embed.priceNear);
  const edition = editionMeta(embed);
  const collectionId =
    embed.collectionId?.trim() || embed.latest?.collectionId?.trim() || '';
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
            className="post-card-scarce-buy"
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

  if (isDropFamily) {
    const dropCta = resolvePostDropCta({ embed, isPostAuthor: isAuthor });
    if (dropCta.kind === 'muted') {
      return (
        <div className="post-card-scarce-cta post-card-scarce-cta--muted">
          <span className="post-card-scarce-cta-main">
            {price
              ? `${dropCta.mutedLabel} · ${price} NEAR`
              : dropCta.mutedLabel}
          </span>
          {edition ? (
            <span className="post-card-scarce-cta-meta">{edition}</span>
          ) : null}
          {listenSlot}
          <CommerceLinkRow links={links} />
        </div>
      );
    }
    if (dropCta.kind === 'open') {
      return (
        <div className="post-card-scarce-cta">
          {collectionId ? <OpenDropButton collectionId={collectionId} /> : null}
          {listenSlot}
          <CommerceLinkRow links={links} />
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
              {price ? `Bid · ${price} NEAR` : 'Bid'}
            </span>
          </button>
          {listenSlot}
          <CommerceLinkRow links={links} />
        </div>
      );
    }
    // mint | buy
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
            {dropCta.kind === 'mint'
              ? price
                ? `Mint · ${price} NEAR`
                : 'Mint'
              : price
                ? `Buy · ${price} NEAR`
                : 'Buy'}
          </span>
          {edition && dropCta.kind === 'mint' ? (
            <span className="post-card-scarce-buy-meta">{edition}</span>
          ) : null}
        </button>
        {listenSlot}
        <CommerceLinkRow links={links} />
      </div>
    );
  }

  if (embed.status === 'minted') {
    return (
      <div className="post-card-scarce-cta post-card-scarce-cta--muted">
        <span className="post-card-scarce-cta-main">Owned</span>
        {listenSlot}
        <CommerceLinkRow links={links} />
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
        {listenSlot}
        <CommerceLinkRow links={links} />
      </div>
    );
  }

  if (embed.status === 'auction') {
    const canBid = !isAuthor && Boolean(embed.tokenId) && Boolean(onBid);
    if (isAuthor) {
      return (
        <div className="post-card-scarce-cta post-card-scarce-cta--muted">
          <span className="post-card-scarce-cta-main">
            {price ? `Auction · ${price} NEAR` : 'Your auction'}
          </span>
          {listenSlot}
          <CommerceLinkRow links={links} />
        </div>
      );
    }
    if (!canBid) {
      return (
        <div className="post-card-scarce-cta post-card-scarce-cta--muted">
          <span className="post-card-scarce-cta-main">
            {price ? `Auction · ${price} NEAR…` : 'Auction…'}
          </span>
          {listenSlot}
          <CommerceLinkRow links={links} />
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
        {listenSlot}
        <CommerceLinkRow links={links} />
      </div>
    );
  }

  const isLazyMint =
    embed.status === 'lazy_listing' && Boolean(embed.listingId);
  const isSecondaryBuy =
    embed.status === 'listed' && Boolean(embed.tokenId);
  const canCommerce = !isAuthor && (isLazyMint || isSecondaryBuy);
  const primaryIsMint = isPrimaryMintStatus(embed.status);

  if (isAuthor) {
    return (
      <div className="post-card-scarce-cta post-card-scarce-cta--muted">
        <span className="post-card-scarce-cta-main">
          {embed.status === 'lazy_listing'
            ? price
              ? `Your Drop · ${price} NEAR`
              : 'Your Drop'
            : price
              ? `Yours · ${price} NEAR`
              : 'Yours'}
        </span>
        {edition ? (
          <span className="post-card-scarce-cta-meta">{edition}</span>
        ) : null}
        {listenSlot}
        <CommerceLinkRow links={links} />
      </div>
    );
  }

  if (!canCommerce) {
    return (
      <div className="post-card-scarce-cta post-card-scarce-cta--muted">
        <span className="post-card-scarce-cta-main">
          {primaryIsMint
            ? price
              ? `Drop · ${price} NEAR…`
              : 'Drop…'
            : price
              ? `Listing · ${price} NEAR…`
              : 'Listing…'}
        </span>
        {listenSlot}
        <CommerceLinkRow links={links} />
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
          {primaryIsMint
            ? price
              ? `Mint · ${price} NEAR`
              : 'Mint'
            : price
              ? `Buy · ${price} NEAR`
              : 'Buy'}
        </span>
        {edition && primaryIsMint ? (
          <span className="post-card-scarce-buy-meta">{edition}</span>
        ) : null}
      </button>
      {listenSlot}
      <CommerceLinkRow links={links} />
    </div>
  );
}
