'use client';

import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import { CommunityDiscoverRow } from '@/components/community-cards';
import {
  LauncherSocialPeekList,
  LauncherSocialPeekRow,
  LauncherSocialPeekSkeleton,
} from '@/components/launcher-home/launcher-peek-row';
import {
  DiscoverCommunityListSkeleton,
  DiscoverTrendingChipSectionSkeleton,
  DiscoverTrendingGuildsSectionSkeleton,
} from '@/features/discover/discover-loading-skeleton';
import type { DiscoverScarcePeek } from '@/features/discover/discover-scarce-peeks';
import {
  APP_HOME_PATH,
  appPath,
  collectionPath,
} from '@/lib/app-routes';
import type { DiscoverTrendingHub } from '@/lib/discover-trending-server';
import {
  movingChipCountLabel,
  movingPostHeatLabel,
  movingPostTalkLabel,
  movingProposalMeta,
  movingScarceSignalLabel,
  talkedAboutThreadHref,
} from '@/lib/discover-moving';
import {
  formatPostPeekExcerpt,
  formatPostTimestamp,
  formatRelativePostTimestamp,
} from '@/lib/post-display';
import { postThreadPath } from '@/lib/post-routes';

const SECTION_LIMIT = 6;

export function MovingSectionHead({
  heading,
  seeAll,
}: {
  heading: string;
  seeAll?: { href?: string; onClick?: () => void } | null;
}) {
  return (
    <div className="discover-trending-section-head">
      <h2 className="discover-trending-heading">{heading}</h2>
      {seeAll?.href ? (
        <Link href={seeAll.href} className="discover-trending-see-all">
          See all
        </Link>
      ) : seeAll?.onClick ? (
        <button
          type="button"
          className="discover-trending-see-all"
          onClick={seeAll.onClick}
        >
          See all
        </button>
      ) : null}
    </div>
  );
}

export function MovingPostPeekSection({
  heading,
  why,
  rows,
}: {
  heading: string;
  why: 'hot' | 'talk';
  rows: PostRow[] | null;
}) {
  if (rows === null) {
    return (
      <section className="discover-trending-section" aria-hidden>
        <div className="discover-trending-section-head">
          <span className="standing-row-shimmer standing-row-shimmer-line discover-trending-shimmer-heading" />
          <span className="standing-row-shimmer standing-row-shimmer-line discover-trending-shimmer-see-all" />
        </div>
        <LauncherSocialPeekSkeleton count={4} />
      </section>
    );
  }
  if (rows.length === 0) return null;
  const contextLabel =
    why === 'hot' ? movingPostHeatLabel() : movingPostTalkLabel();
  return (
    <section
      className="discover-trending-section"
      aria-label={heading}
      data-why={why}
    >
      <MovingSectionHead heading={heading} seeAll={{ href: APP_HOME_PATH }} />
      <LauncherSocialPeekList aria-label={heading}>
        {rows.slice(0, SECTION_LIMIT).map((post, index) => (
          <LauncherSocialPeekRow
            key={`${heading}-${post.accountId}-${post.postId}`}
            href={
              why === 'talk' ? talkedAboutThreadHref(post) : postThreadPath(post)
            }
            accountId={post.accountId}
            profileName={post.authorName}
            avatarUrl={post.authorAvatar}
            contextLabel={contextLabel}
            timeLabel={formatRelativePostTimestamp(post.blockTimestamp)}
            timeTitle={formatPostTimestamp(post.blockTimestamp)}
            excerpt={formatPostPeekExcerpt(post.value, {
              kind: post.kind,
              postId: post.postId,
            })}
            showDivider={index > 0}
          />
        ))}
      </LauncherSocialPeekList>
    </section>
  );
}

export function MovingChipPeekSection({
  heading,
  rows,
  seeAll,
}: {
  heading: string;
  rows:
    | Array<{
        key: string;
        href: string;
        label: string;
        count?: number;
        ticker?: boolean;
      }>
    | null;
  seeAll?: { href?: string; onClick?: () => void } | null;
}) {
  if (rows === null) {
    return <DiscoverTrendingChipSectionSkeleton />;
  }
  if (rows.length === 0) return null;
  return (
    <section className="discover-trending-section" aria-label={heading}>
      <MovingSectionHead heading={heading} seeAll={seeAll} />
      <div className="discover-trending-chips">
        {rows.slice(0, SECTION_LIMIT).map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={
              item.ticker
                ? 'discover-trending-chip discover-trending-chip--ticker'
                : 'discover-trending-chip'
            }
          >
            {item.label}
            {item.count != null && item.count > 0 ? (
              <span className="discover-trending-chip-count">
                {movingChipCountLabel(item.count)}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}

export function MovingCoverPeekSection({
  heading,
  seeAllHref,
  kind,
  rows,
}: {
  heading: string;
  seeAllHref: string;
  kind: 'traded' | 'loved' | 'sold';
  rows: DiscoverScarcePeek[] | null;
}) {
  if (rows === null) {
    return <DiscoverTrendingGuildsSectionSkeleton />;
  }
  if (rows.length === 0) return null;
  return (
    <section className="discover-trending-section" aria-label={heading}>
      <MovingSectionHead heading={heading} seeAll={{ href: seeAllHref }} />
      <ul className="discover-cover-peeks">
        {rows.map((scarce) => {
          const title = scarce.title?.trim() || scarce.collectionId;
          const signal =
            kind === 'sold'
              ? scarce.lastSaleTimestamp
                ? formatRelativePostTimestamp(scarce.lastSaleTimestamp)
                : null
              : movingScarceSignalLabel(kind, scarce.signalCount);
          const meta = signal || scarce.appId?.trim() || null;
          return (
            <li key={`${heading}-${scarce.collectionId}`}>
              <Link
                href={collectionPath(scarce.collectionId)}
                className="discover-cover-peek"
              >
                <span
                  className={`discover-cover-peek-thumb market-listing-thumb${
                    scarce.coverUrl ? ' has-media' : ''
                  }`}
                >
                  {scarce.coverUrl ? (
                    <img src={scarce.coverUrl} alt="" />
                  ) : (
                    <span className="market-listing-thumb-fallback" />
                  )}
                </span>
                <span className="discover-cover-peek-copy">
                  <span className="discover-cover-peek-title">{title}</span>
                  {meta ? (
                    <span className="discover-cover-peek-meta">{meta}</span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function MovingHubPeekSection({
  heading,
  rows,
  onSeeAll,
}: {
  heading: string;
  rows: DiscoverTrendingHub[] | null;
  onSeeAll: () => void;
}) {
  if (rows === null) {
    return (
      <section className="discover-trending-section" aria-label={heading}>
        <MovingSectionHead heading={heading} seeAll={{ onClick: onSeeAll }} />
        <DiscoverCommunityListSkeleton label="Loading hubs" count={4} />
      </section>
    );
  }
  if (rows.length === 0) return null;
  return (
    <section className="discover-trending-section" aria-label={heading}>
      <MovingSectionHead heading={heading} seeAll={{ onClick: onSeeAll }} />
      <div className="community-summary-card-grid">
        {rows.map((hub) => {
          const title = hub.title?.trim() || hub.appId;
          return (
            <CommunityDiscoverRow
              key={hub.appId}
              href={appPath(hub.appId)}
              seedId={hub.appId}
              bannerUrl={hub.bannerUrl ?? null}
              markUrl={hub.markUrl ?? null}
              markVariant="logo"
              title={title}
            />
          );
        })}
      </div>
    </section>
  );
}

export function MovingProposalPeekSection({
  heading,
  seeAllHref,
  rows,
}: {
  heading: string;
  seeAllHref: string;
  rows: Array<{
    key: string;
    href: string;
    title: string;
    status?: string | null;
    proposalType?: string | null;
    groupId?: string | null;
    timeLabel?: string | null;
  }> | null;
}) {
  if (rows === null) {
    return <DiscoverTrendingGuildsSectionSkeleton />;
  }
  if (rows.length === 0) return null;
  return (
    <section className="discover-trending-section" aria-label={heading}>
      <MovingSectionHead heading={heading} seeAll={{ href: seeAllHref }} />
      <ul className="discover-focus-rows">
        {rows.slice(0, SECTION_LIMIT).map((row) => {
          const status = movingProposalMeta(row);
          const meta = [status, row.timeLabel].filter(Boolean).join(' · ');
          return (
            <li key={row.key}>
              <Link href={row.href} className="discover-focus-row">
                <span className="discover-focus-row-label">{row.title}</span>
                {meta ? (
                  <span className="discover-focus-row-meta">{meta}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
