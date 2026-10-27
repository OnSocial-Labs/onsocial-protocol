'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ipfsImgSrcSet, ipfsImgVariantUrl } from '@onsocial/ui';
import {
  communityCoverClassName,
  communityCoverStyle,
} from '@/components/community-cards/community-cover';
import { communityMonogram } from '@/components/community-cards/community-monogram';

/** Banner strip is 4.85rem wide; 128 covers 1x, 384 covers retina. */
const DISCOVER_BANNER_SIZES = '78px';

export type CommunityMarkVariant = 'badge' | 'crest' | 'logo';

/**
 * Discover / search place row — banner left, mark before name, one-line copy + meta.
 * Shared by guilds, DAOs, and hubs.
 * Unset mark uses a letter monogram; unset banner keeps a seeded wash only.
 */
export function CommunityDiscoverRow({
  href,
  seedId,
  bannerUrl,
  markUrl,
  markVariant = 'badge',
  title,
  description,
  meta,
  ariaLabel,
}: {
  href: string;
  seedId: string;
  bannerUrl: string | null;
  markUrl?: string | null;
  markVariant?: CommunityMarkVariant;
  title: string;
  description?: string | null;
  meta?: ReactNode;
  ariaLabel?: string;
}) {
  const descriptionLine = description?.trim() || null;
  const mono = communityMonogram(title);
  const bannerSrcSet = ipfsImgSrcSet(bannerUrl, [128, 384]);
  const markSrc = markUrl ? (ipfsImgVariantUrl(markUrl, 128) ?? markUrl) : null;

  return (
    <Link
      className="community-summary-card community-summary-card--grid"
      href={href}
      scroll={false}
      aria-label={ariaLabel ?? title}
    >
      <span className="community-summary-media" aria-hidden>
        <span
          className={communityCoverClassName(bannerUrl, 'discover')}
          style={communityCoverStyle(bannerUrl, seedId)}
        >
          {bannerUrl ? (
            <img
              src={bannerUrl}
              srcSet={bannerSrcSet}
              sizes={bannerSrcSet ? DISCOVER_BANNER_SIZES : undefined}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ) : null}
        </span>
      </span>

      <span className="community-summary-body">
        <span className="community-summary-name-row">
          <span
            className={`community-summary-mark community-summary-mark--${markVariant}${
              markUrl ? ' has-media' : ''
            }`}
            aria-hidden
          >
            {markSrc ? (
              <img src={markSrc} alt="" loading="lazy" decoding="async" />
            ) : (
              <span className="community-mark-mono">{mono}</span>
            )}
          </span>
          <span className="community-summary-name">{title}</span>
        </span>
        {descriptionLine ? (
          <span className="community-summary-copy">{descriptionLine}</span>
        ) : null}
        {meta ? <span className="community-summary-meta">{meta}</span> : null}
      </span>
    </Link>
  );
}
