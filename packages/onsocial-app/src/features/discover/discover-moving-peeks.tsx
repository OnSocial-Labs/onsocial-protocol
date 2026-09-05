'use client';

import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import {
  LauncherSocialPeekList,
  LauncherSocialPeekRow,
  LauncherSocialPeekSkeleton,
} from '@/components/launcher-home/launcher-peek-row';
import {
  DiscoverCoverPeekListSkeleton,
  DiscoverCoverPeekSectionSkeleton,
  DiscoverTrendingChipSectionSkeleton,
} from '@/features/discover/discover-loading-skeleton';
import type { DiscoverScarcePeek } from '@/features/discover/discover-scarce-peeks';
import { communityMonogram } from '@/components/community-cards/community-monogram';
import { placeFallbackCoverStyle } from '@/components/community-cards/community-cover';
import {
  APP_HOME_PATH,
  appPath,
  collectionPath,
} from '@/lib/app-routes';
import { portfolioPath } from '@/lib/overlay-routes';
import type { DiscoverTrendingHub } from '@/lib/discover-trending-server';
import {
  movingChipCountLabel,
  movingProposalMeta,
  movingScarceSignalLabel,
  talkedAboutThreadHref,
  type MovingActivePeek,
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

/** Always the full cover box — art when present, seeded mark when not. */
function MovingCoverThumb({
  src,
  label,
  seedId,
}: {
  src?: string | null;
  label: string;
  seedId: string;
}) {
  const art = src?.trim() || '';
  if (art) {
    return (
      <span className="discover-cover-peek-thumb market-listing-thumb has-media">
        <img src={art} alt="" />
      </span>
    );
  }
  return (
    <span
      className="discover-cover-peek-thumb market-listing-thumb discover-cover-peek-thumb--mark"
      style={placeFallbackCoverStyle(seedId)}
    >
      <span className="discover-cover-peek-mark">{communityMonogram(label)}</span>
    </span>
  );
}

function MovingPeekHeadSkeleton({ seeAll }: { seeAll?: boolean }) {
  return (
    <div className="discover-trending-section-head">
      <span className="standing-row-shimmer standing-row-shimmer-line discover-trending-shimmer-heading" />
      {seeAll ? (
        <span className="standing-row-shimmer standing-row-shimmer-line discover-trending-shimmer-see-all" />
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
  const seeAll = why === 'hot' ? { href: APP_HOME_PATH } : null;
  if (rows === null) {
    return (
      <section className="discover-trending-section" aria-hidden>
        <MovingPeekHeadSkeleton seeAll={Boolean(seeAll)} />
        <LauncherSocialPeekSkeleton count={4} />
      </section>
    );
  }
  if (rows.length === 0) return null;
  return (
    <section
      className="discover-trending-section"
      aria-label={heading}
      data-why={why}
    >
      <MovingSectionHead heading={heading} seeAll={seeAll} />
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

export function MovingFacePeekSection({
  heading,
  rows,
  onSeeAll,
}: {
  heading: string;
  rows: MovingActivePeek[] | null;
  onSeeAll: () => void;
}) {
  if (rows === null) {
    return (
      <section className="discover-trending-section" aria-hidden>
        <MovingPeekHeadSkeleton seeAll />
        <LauncherSocialPeekSkeleton count={4} />
      </section>
    );
  }
  if (rows.length === 0) return null;
  return (
    <section className="discover-trending-section" aria-label={heading}>
      <MovingSectionHead heading={heading} seeAll={{ onClick: onSeeAll }} />
      <LauncherSocialPeekList aria-label={heading}>
        {rows.slice(0, SECTION_LIMIT).map((person, index) => (
          <LauncherSocialPeekRow
            key={`${heading}-${person.accountId}`}
            href={portfolioPath(person.accountId)}
            accountId={person.accountId}
            profileName={person.name}
            avatarUrl={person.avatarUrl}
            timeLabel={
              person.lastPostTimestamp
                ? formatRelativePostTimestamp(person.lastPostTimestamp)
                : null
            }
            timeTitle={
              person.lastPostTimestamp
                ? formatPostTimestamp(person.lastPostTimestamp)
                : null
            }
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
        time?: string;
        ticker?: boolean;
      }>
    | null;
  seeAll?: { href?: string; onClick?: () => void } | null;
}) {
  if (rows === null) {
    return <DiscoverTrendingChipSectionSkeleton showSeeAll={Boolean(seeAll)} />;
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
            <span className="discover-trending-chip-label">{item.label}</span>
            {item.time ? (
              <span className="discover-trending-chip-time">{item.time}</span>
            ) : item.count != null && item.count > 0 ? (
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
  seeAll,
  kind,
  rows,
}: {
  heading: string;
  seeAllHref?: string;
  seeAll?: { href?: string; onClick?: () => void } | null;
  kind: 'traded' | 'loved' | 'sold';
  rows: DiscoverScarcePeek[] | null;
}) {
  const resolvedSeeAll = seeAll ?? (seeAllHref ? { href: seeAllHref } : null);
  if (rows === null) {
    return <DiscoverCoverPeekSectionSkeleton showSeeAll />;
  }
  if (rows.length === 0) return null;
  return (
    <section className="discover-trending-section" aria-label={heading}>
      <MovingSectionHead heading={heading} seeAll={resolvedSeeAll} />
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
                <MovingCoverThumb
                  src={scarce.coverUrl}
                  label={title}
                  seedId={scarce.collectionId}
                />
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
      <section className="discover-trending-section" aria-hidden>
        <MovingPeekHeadSkeleton seeAll />
        <DiscoverCoverPeekListSkeleton count={4} />
      </section>
    );
  }
  if (rows.length === 0) return null;
  return (
    <section className="discover-trending-section" aria-label={heading}>
      <MovingSectionHead heading={heading} seeAll={{ onClick: onSeeAll }} />
      <ul className="discover-cover-peeks">
        {rows.map((hub) => {
          const title = hub.title?.trim() || hub.appId;
          const time = hub.lastActivityTimestamp
            ? formatRelativePostTimestamp(hub.lastActivityTimestamp)
            : null;
          return (
            <li key={hub.appId}>
              <Link href={appPath(hub.appId)} className="discover-cover-peek">
                <MovingCoverThumb
                  src={hub.markUrl}
                  label={title}
                  seedId={hub.appId}
                />
                <span className="discover-cover-peek-copy">
                  <span className="discover-cover-peek-title">{title}</span>
                  {time ? (
                    <span className="discover-cover-peek-meta">{time}</span>
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
    return <DiscoverCoverPeekSectionSkeleton showSeeAll />;
  }
  if (rows.length === 0) return null;
  return (
    <section className="discover-trending-section" aria-label={heading}>
      <MovingSectionHead heading={heading} seeAll={{ href: seeAllHref }} />
      <ul className="discover-cover-peeks">
        {rows.slice(0, SECTION_LIMIT).map((row) => {
          const status = movingProposalMeta(row);
          const meta = [status, row.timeLabel].filter(Boolean).join(' · ');
          return (
            <li key={row.key}>
              <Link href={row.href} className="discover-cover-peek">
                <MovingCoverThumb
                  label={row.title}
                  seedId={row.groupId ?? row.key}
                />
                <span className="discover-cover-peek-copy">
                  <span className="discover-cover-peek-title">{row.title}</span>
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
