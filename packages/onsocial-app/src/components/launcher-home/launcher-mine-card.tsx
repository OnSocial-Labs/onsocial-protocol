'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ipfsImgSrcSet, ipfsImgVariantUrl } from '@onsocial/ui';
import {
  communityCoverClassName,
  communityCoverStyle,
} from '@/components/community-cards/community-cover';
import type { CommunityMarkVariant } from '@/components/community-cards/community-discover-row';
import { communityMonogram } from '@/components/community-cards/community-monogram';

/** Rail cards span 9.25rem–42% of the ~553px launcher column. */
const MINE_BANNER_SIZES = '(max-width: 640px) 42vw, 232px';

export function LauncherMineRail({ children }: { children: ReactNode }) {
  return <ul className="launcher-mine-rail os-scrollbar-none">{children}</ul>;
}

/** Horizontal card shimmer while mine membership loads. */
export function LauncherMineRailSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul
      className="launcher-mine-rail launcher-mine-rail--skeleton os-scrollbar-none"
      aria-busy="true"
      aria-label="Loading your spaces"
    >
      {Array.from({ length: count }, (_, index) => (
        <li key={index} aria-hidden>
          <div className="launcher-mine-card launcher-mine-card--skeleton">
            <span className="launcher-mine-banner standing-row-shimmer" />
            <span className="launcher-mine-rule" aria-hidden />
            <span className="launcher-mine-foot">
              <span className="launcher-mine-mark standing-row-shimmer" />
              <span className="standing-row-shimmer standing-row-shimmer-line launcher-mine-title-shimmer" />
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Mine home place card — banner plane, hairline, footer mark + title.
 * No members / description (those live on Discover).
 * Unset mark uses a letter monogram; unset banner keeps a seeded wash only.
 */
export function LauncherMineCard({
  href,
  seedId,
  title,
  subtitle,
  bannerUrl,
  markUrl,
  markVariant = 'crest',
  ariaLabel,
}: {
  href: string;
  /** Stable id for seeded banner wash when no image. */
  seedId: string;
  title: string;
  /** Quiet second line (e.g. DAO `@accountId`). */
  subtitle?: string | null;
  bannerUrl?: string | null;
  markUrl?: string | null;
  markVariant?: CommunityMarkVariant;
  ariaLabel?: string;
}) {
  const cover = bannerUrl ?? null;
  const mono = communityMonogram(title);
  const bannerSrcSet = ipfsImgSrcSet(cover, [384, 1080]);
  const markSrc = markUrl ? (ipfsImgVariantUrl(markUrl, 128) ?? markUrl) : null;

  return (
    <li>
      <Link
        href={href}
        className="launcher-mine-card"
        scroll={false}
        aria-label={ariaLabel ?? title}
      >
        <span className="launcher-mine-banner" aria-hidden>
          <span
            className={communityCoverClassName(cover, 'mine')}
            style={communityCoverStyle(cover, seedId)}
          >
            {cover ? (
              <img
                src={cover}
                srcSet={bannerSrcSet}
                sizes={bannerSrcSet ? MINE_BANNER_SIZES : undefined}
                alt=""
                loading="lazy"
                decoding="async"
              />
            ) : null}
          </span>
        </span>
        <span className="launcher-mine-rule" aria-hidden />
        <span className="launcher-mine-foot">
          <span
            className={`launcher-mine-mark launcher-mine-mark--${markVariant}${
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
          <span className="launcher-mine-foot-copy">
            <span className="launcher-mine-card-title">{title}</span>
            {subtitle ? (
              <span className="launcher-mine-card-meta">{subtitle}</span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}
