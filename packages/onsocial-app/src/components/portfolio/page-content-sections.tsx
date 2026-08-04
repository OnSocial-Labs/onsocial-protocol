'use client';

import { Fragment, useMemo } from 'react';
import Link from 'next/link';
import { Divider, ProtocolMotionArrow } from '@onsocial/ui';
import { GuildSummaryCard } from '@/features/guilds/guild-summary-card';
import { PortfolioLinkIcon } from '@/components/portfolio/portfolio-link-icon';
import {
  PageDrawerCreatedRail,
  PageDrawerCreatedSeeAll,
  PageDrawerHoldingsRail,
  PageDrawerHoldingsSeeAll,
  PageDrawerPostPeekList,
} from '@/components/portfolio/page-drawer-peeks';
import { PortfolioStoreShelf } from '@/components/portfolio/portfolio-store-shelf';
import {
  PAGE_DRAWER_GUILD_PEEK,
  PAGE_SECTION_LABELS,
  pageDrawerSectionDomId,
  pageSectionCountHint,
  resolveVisiblePageSections,
} from '@/lib/page-sections';
import type {
  ProfileCreatedPeek,
  ProfilePostPeek,
} from '@/lib/fetch-profile-peeks';
import type { PortfolioHoldingPeek } from '@/lib/portfolio-holdings';
import {
  EMPTY_PROFILE_STORE,
  type ProfileStoreShelf,
} from '@/lib/profile-store-types';
import type { PublicPageConfig, PublicPageStats } from '@/lib/page-data';
import type { ProfileGuildSummary } from '@/lib/profile-guilds';
import {
  portfolioLinkDetail,
  resolvePortfolioSocialLinks,
  type PortfolioSocialLink,
} from '@/lib/profile-social-links';
import { APP_GROUPS_PATH } from '@/lib/app-routes';
import { overlayPath } from '@/lib/overlay-routes';

interface PageContentSectionsProps {
  pageAccountId: string;
  profileLinks?: unknown;
  config: PublicPageConfig;
  stats: PublicPageStats;
  guilds?: ProfileGuildSummary[];
  postPeeks?: ProfilePostPeek[];
  /** Public minted-by peeks for Created. */
  createdPeeks?: ProfileCreatedPeek[];
  /** Indexed mint total for Created count chip (may exceed peeks). */
  createdMintCount?: number;
  /** Owner wallet holdings for Collectibles (empty for visitors). */
  holdings?: PortfolioHoldingPeek[];
  storeShelf?: ProfileStoreShelf;
}

function PageDrawerLinksList({ links }: { links: PortfolioSocialLink[] }) {
  return (
    <ul className="page-drawer-links">
      {links.map((link) => {
        const detail = portfolioLinkDetail(link);
        return (
          <li key={link.key}>
            <a
              className="page-drawer-link-row group"
              href={link.href}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span className="page-drawer-link-icon" aria-hidden>
                <PortfolioLinkIcon
                  kind={link.kind}
                  className="page-drawer-link-glyph"
                />
              </span>
              <span className="page-drawer-link-copy">
                <span className="page-drawer-link-label">{link.label}</span>
                {detail && detail !== link.label ? (
                  <span className="page-drawer-link-detail">{detail}</span>
                ) : null}
              </span>
              <ProtocolMotionArrow className="page-drawer-link-arrow" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function PageContentSections({
  pageAccountId,
  profileLinks = null,
  config,
  stats,
  guilds = [],
  postPeeks = [],
  createdPeeks = [],
  createdMintCount = 0,
  holdings = [],
  storeShelf = EMPTY_PROFILE_STORE,
}: PageContentSectionsProps) {
  const links = useMemo(
    () => resolvePortfolioSocialLinks(profileLinks),
    [profileLinks]
  );

  const holdingsCount = holdings.length;
  const createdCount = Math.max(createdPeeks.length, createdMintCount);
  const storeListingCount = storeShelf.listingCount + storeShelf.drops.length;

  const sections = useMemo(
    () =>
      resolveVisiblePageSections(config, {
        stats,
        guilds,
        links,
        scarceCount: holdingsCount,
        createdCount,
        storeListingCount,
        postPeekCount: postPeeks.length,
      }),
    [
      config,
      stats,
      guilds,
      links,
      holdingsCount,
      createdCount,
      storeListingCount,
      postPeeks.length,
    ]
  );

  const peekGuilds = guilds.slice(0, PAGE_DRAWER_GUILD_PEEK);
  const guildOverflow = Math.max(0, guilds.length - peekGuilds.length);
  const feedHref = overlayPath(pageAccountId, 'feed');

  if (sections.length === 0) {
    return (
      <div className="page-drawer-sections">
        <p className="page-drawer-section-empty">Nothing to show yet.</p>
        <div className="page-drawer-scroll-end" aria-hidden />
      </div>
    );
  }

  return (
    <div className="page-drawer-sections">
      {sections.map((section, index) => {
        const count = pageSectionCountHint(section, stats, {
          scarceCount: holdingsCount,
          createdCount,
          createdCountHint: createdCount,
          storeListingCount,
        });
        const showGuildRail = section === 'groups' && peekGuilds.length > 0;
        const showLinks = section === 'links' && links.length > 0;
        const showPosts = section === 'posts';
        const showStore = section === 'store' && storeListingCount > 0;
        const showCreated = section === 'created' && createdCount > 0;
        const showHoldings = section === 'collectibles' && holdingsCount > 0;

        return (
          <Fragment key={section}>
            {index > 0 ? <Divider variant="detail" /> : null}
            <section
              id={pageDrawerSectionDomId(section)}
              className="page-drawer-section"
            >
              <header className="page-drawer-section-header">
                <h3 className="page-drawer-section-title">
                  {PAGE_SECTION_LABELS[section]}
                </h3>
                {count ? (
                  <span className="page-drawer-section-count">{count}</span>
                ) : null}
              </header>

              {showPosts ? (
                <>
                  <PageDrawerPostPeekList
                    pageAccountId={pageAccountId}
                    posts={postPeeks}
                  />
                  {postPeeks.length === 0 ? (
                    <p className="page-drawer-section-empty">
                      Latest posts open in their feed.
                    </p>
                  ) : null}
                  <Link
                    className="page-drawer-section-action"
                    href={feedHref}
                    scroll={false}
                  >
                    See all posts
                  </Link>
                </>
              ) : null}

              {showStore ? (
                <PortfolioStoreShelf
                  pageAccountId={pageAccountId}
                  shelf={storeShelf}
                />
              ) : null}

              {showCreated ? (
                <>
                  <PageDrawerCreatedRail created={createdPeeks} />
                  {createdPeeks.length === 0 ? (
                    <p className="page-drawer-section-empty">
                      Created editions open in Market.
                    </p>
                  ) : null}
                  <PageDrawerCreatedSeeAll pageAccountId={pageAccountId} />
                </>
              ) : null}

              {showHoldings ? (
                <>
                  <PageDrawerHoldingsRail holdings={holdings} />
                  <PageDrawerHoldingsSeeAll />
                </>
              ) : null}

              {showLinks ? <PageDrawerLinksList links={links} /> : null}

              {showGuildRail ? (
                <div className="page-drawer-guild-rail" aria-label="Guilds">
                  {peekGuilds.map((guild) => (
                    <GuildSummaryCard
                      key={guild.groupId}
                      variant="rail"
                      guild={guild}
                    />
                  ))}
                </div>
              ) : null}

              {section === 'groups' && guilds.length > 0 ? (
                <Link
                  className="page-drawer-section-action"
                  href={APP_GROUPS_PATH}
                >
                  {guildOverflow > 0
                    ? `See all guilds · +${guildOverflow}`
                    : 'Browse all guilds'}
                </Link>
              ) : null}
            </section>
          </Fragment>
        );
      })}

      {/* Lets last content scroll under the floating gesture pill. */}
      <div className="page-drawer-scroll-end" aria-hidden />
    </div>
  );
}
