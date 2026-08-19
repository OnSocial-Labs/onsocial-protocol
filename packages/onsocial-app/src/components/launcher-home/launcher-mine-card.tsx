'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  communityCoverClassName,
  communityMineCoverStyle,
} from '@/components/community-cards/community-cover';
import type { CommunityMarkVariant } from '@/components/community-cards/community-discover-row';
import { communityMonogram } from '@/components/community-cards/community-monogram';

export function LauncherMineRail({ children }: { children: ReactNode }) {
  return <ul className="launcher-mine-rail">{children}</ul>;
}

/**
 * Mine home place card — banner plane, hairline, footer mark + title.
 * No members / description (those live on Discover).
 * Unset banner / mark use letter monograms so the rail stays consistent.
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
            style={communityMineCoverStyle(cover, seedId)}
          >
            {cover ? (
              <img src={cover} alt="" />
            ) : (
              <span className="community-cover-mono">{mono}</span>
            )}
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
            {markUrl ? (
              <img src={markUrl} alt="" />
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
