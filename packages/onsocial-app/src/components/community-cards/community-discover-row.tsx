'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  communityCoverClassName,
  communityCoverStyle,
} from '@/components/community-cards/community-cover';
import { communityMonogram } from '@/components/community-cards/community-monogram';

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
          {bannerUrl ? <img src={bannerUrl} alt="" /> : null}
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
            {markUrl ? (
              <img src={markUrl} alt="" />
            ) : (
              <span className="community-mark-mono">{mono}</span>
            )}
          </span>
          <span className="community-summary-name">{title}</span>
        </span>
        {descriptionLine ? (
          <span className="community-summary-copy">{descriptionLine}</span>
        ) : null}
        {meta ? (
          <span className="community-summary-meta">{meta}</span>
        ) : null}
      </span>
    </Link>
  );
}
