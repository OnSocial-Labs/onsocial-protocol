'use client';

import Link from 'next/link';
import type { PostScarceEmbed } from '@onsocial/sdk';
import {
  appPath,
  collectionPath,
  marketAppPath,
  marketCreatorPath,
} from '@/lib/app-routes';

interface PostScarceCtaProps {
  embed: PostScarceEmbed;
  /** Hide Collect / Bid when the viewer authored the post. */
  isAuthor?: boolean;
  /** Author account — used for Market deep links. */
  authorAccountId?: string;
  /** Author can list when status is none / minted (no active listing). */
  canList?: boolean;
  onList?: () => void;
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

function commerceLinks(
  embed: PostScarceEmbed,
  authorAccountId?: string
): { href: string; label: string }[] {
  const links: { href: string; label: string }[] = [];
  const collectionId = embed.latest?.collectionId?.trim();
  const appId = embed.latest?.appId?.trim();
  if (collectionId) {
    links.push({ href: collectionPath(collectionId), label: 'Drop' });
  }
  if (appId) {
    links.push({ href: appPath(appId), label: 'Hub' });
  }
  // Market only when it narrows something (store or creator) — not a bare /market.
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

/**
 * One-line commerce CTA under post media / above engagement.
 * Vocabulary: Collect · List · Amplify (Amplify lives in engagement row).
 */
export function PostScarceCta({
  embed,
  isAuthor = false,
  authorAccountId,
  canList = false,
  onList,
  onBuy,
  onBid,
}: PostScarceCtaProps) {
  const links = commerceLinks(embed, authorAccountId);
  const price = formatPriceNear(embed.priceNear);
  const edition = editionMeta(embed);

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

  if (embed.status === 'minted') {
    return (
      <div className="post-card-scarce-cta post-card-scarce-cta--muted">
        <span className="post-card-scarce-cta-main">Collected</span>
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
        <CommerceLinkRow links={links} />
      </div>
    );
  }

  const canCollect =
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
        <CommerceLinkRow links={links} />
      </div>
    );
  }

  if (!canCollect) {
    return (
      <div className="post-card-scarce-cta post-card-scarce-cta--muted">
        <span className="post-card-scarce-cta-main">
          {price ? `Listing · ${price} NEAR…` : 'Listing…'}
        </span>
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
          {price ? `Collect · ${price} NEAR` : 'Collect'}
        </span>
        {edition ? (
          <span className="post-card-scarce-buy-meta">{edition}</span>
        ) : null}
      </button>
      <CommerceLinkRow links={links} />
    </div>
  );
}
