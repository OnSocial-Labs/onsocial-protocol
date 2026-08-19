'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  communityCoverClassName,
  communityCoverStyle,
} from '@/components/community-cards/community-cover';

export type CommunityMarkVariant = 'badge' | 'crest' | 'logo';

/**
 * Discover / search place row — banner left, mark before name, one-line copy + meta.
 * Shared by guilds, DAOs, and hubs.
 */
export function CommunityDiscoverRow({
  href,
  seedId,
  bannerUrl,
  markUrl,
  markVariant = 'badge',
  reserveMark = false,
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
  /** Keep an empty mark slot so the name never jumps (guild badges). */
  reserveMark?: boolean;
  title: string;
  description?: string | null;
  meta?: ReactNode;
  ariaLabel?: string;
}) {
  const showMark = reserveMark || Boolean(markUrl);
  const descriptionLine = description?.trim() || null;

  return (
    <Link
      className="community-summary-card guild-summary-card guild-summary-card--grid"
      href={href}
      scroll={false}
      aria-label={ariaLabel ?? title}
    >
      <span className="guild-summary-card-media" aria-hidden>
        <span
          className={communityCoverClassName(bannerUrl, 'discover')}
          style={communityCoverStyle(bannerUrl, seedId)}
        >
          {bannerUrl ? <img src={bannerUrl} alt="" /> : null}
        </span>
      </span>

      <span className="guild-summary-card-body">
        <span className="guild-summary-card-name-row">
          {showMark ? (
            <span
              className={`guild-summary-card-badge community-summary-mark community-summary-mark--${markVariant}${
                markUrl ? ' has-media' : ''
              }`}
              aria-hidden
            >
              {markUrl ? <img src={markUrl} alt="" /> : null}
            </span>
          ) : null}
          <span className="guild-summary-card-name">{title}</span>
        </span>
        {descriptionLine ? (
          <span className="guild-summary-card-copy">{descriptionLine}</span>
        ) : null}
        {meta ? (
          <span className="guild-summary-card-meta">{meta}</span>
        ) : null}
      </span>
    </Link>
  );
}
