'use client';

import { Fragment, useMemo } from 'react';
import Link from 'next/link';
import { Divider, ProtocolMotionArrow } from '@onsocial/ui';
import { PortfolioLinkIcon } from '@/components/portfolio/portfolio-link-icon';
import {
  PageDrawerCreatedRail,
  PageDrawerCreatedSeeAll,
  PageDrawerHoldingsRail,
  PageDrawerHoldingsSeeAll,
  PageDrawerPostPeekList,
} from '@/components/portfolio/page-drawer-peeks';
import { PageDrawerGuilds } from '@/components/portfolio/page-drawer-guilds';
import { PortfolioStoreShelf } from '@/components/portfolio/portfolio-store-shelf';
import {
  PAGE_SECTION_LABELS,
  pageDrawerSectionDomId,
  pageSectionCountHint,
  resolveVisiblePageSections,
} from '@/lib/page-sections';
import {
  PAGE_DRAWER_POST_HIGHLIGHT,
  type ProfileCreatedPeek,
  type ProfilePostPeek,
} from '@/lib/fetch-profile-peeks';
import {
  groupHoldingsForRail,
  type PortfolioHoldingPeek,
} from '@/lib/portfolio-holdings';
import {
  EMPTY_PROFILE_STORE,
  type ProfileStoreShelf,
} from '@/lib/profile-store-types';
import type { PublicPageConfig, PublicPageStats } from '@/lib/page-data';
import type { ProfileGuildSummary } from '@/lib/profile-guilds';
import {
  portfolioLinkPresentation,
  resolvePortfolioSocialLinks,
  applyPortfolioLinkNotes,
  type PortfolioSocialLink,
} from '@/lib/profile-social-links';
import { overlayPath } from '@/lib/overlay-routes';
import {
  orderPagePostHighlights,
  preferPinnedOrder,
  orderStoreShelfByPins,
  sectionPinsFor,
} from '@/lib/page-launch-config';

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
  /** Public wallet holdings for Collectibles peeks (on-chain flex). */
  holdings?: PortfolioHoldingPeek[];
  storeShelf?: ProfileStoreShelf;
}

function PageDrawerLinksList({ links }: { links: PortfolioSocialLink[] }) {
  return (
    <ul className="page-drawer-links">
      {links.map((link) => {
        const { title, detail } = portfolioLinkPresentation(link);
        const ariaLabel = detail ? `${title}, ${detail}` : title;
        return (
          <li key={link.key}>
            <a
              className="page-drawer-link-row group"
              href={link.href}
              rel="noopener noreferrer"
              target="_blank"
              aria-label={ariaLabel}
            >
              <span className="page-drawer-link-icon" aria-hidden>
                <PortfolioLinkIcon
                  kind={link.kind}
                  className="page-drawer-link-glyph"
                />
              </span>
              <span className="page-drawer-link-copy">
                <span className="page-drawer-link-label">{title}</span>
                {detail ? (
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
    () =>
      applyPortfolioLinkNotes(
        resolvePortfolioSocialLinks(profileLinks),
        config.linkNotes
      ),
    [profileLinks, config.linkNotes]
  );

  const holdingsCount = holdings.length;
  const holdingsPeekCount = groupHoldingsForRail(holdings).length;
  const createdCount = Math.max(createdPeeks.length, createdMintCount);
  const storeListingCount = storeShelf.listingCount + storeShelf.drops.length;

  const orderedStoreShelf = useMemo(
    () =>
      orderStoreShelfByPins(storeShelf, sectionPinsFor(config, 'store')),
    [storeShelf, config]
  );

  const orderedPosts = useMemo(
    () =>
      orderPagePostHighlights(
        postPeeks,
        sectionPinsFor(config, 'posts'),
        (post) => post.postId,
        PAGE_DRAWER_POST_HIGHLIGHT
      ),
    [postPeeks, config]
  );
  const orderedGuilds = useMemo(
    () =>
      preferPinnedOrder(
        guilds,
        sectionPinsFor(config, 'groups'),
        (guild) => guild.groupId
      ),
    [guilds, config]
  );
  const orderedCreated = useMemo(
    () =>
      preferPinnedOrder(
        createdPeeks,
        sectionPinsFor(config, 'created'),
        (item) => item.tokenId
      ),
    [createdPeeks, config]
  );
  const orderedHoldings = useMemo(
    () =>
      preferPinnedOrder(
        holdings,
        sectionPinsFor(config, 'collectibles'),
        (item) => item.tokenId
      ),
    [holdings, config]
  );

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
          scarceCount: holdingsPeekCount,
          createdCount,
          createdCountHint: createdCount,
          storeListingCount,
        });
        const showGuildRail = section === 'groups' && guilds.length > 0;
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
                <div className="page-drawer-peek-stack">
                  <PageDrawerPostPeekList
                    pageAccountId={pageAccountId}
                    posts={orderedPosts}
                  />
                  <Link
                    className="page-drawer-section-action group"
                    href={feedHref}
                    scroll={false}
                  >
                    See all posts
                    <ProtocolMotionArrow className="page-drawer-section-action-arrow" />
                  </Link>
                </div>
              ) : null}

              {showStore ? (
                <PortfolioStoreShelf
                  pageAccountId={pageAccountId}
                  shelf={orderedStoreShelf}
                />
              ) : null}

              {showCreated ? (
                <div className="page-drawer-peek-stack">
                  <PageDrawerCreatedRail created={orderedCreated} />
                  {orderedCreated.length === 0 ? (
                    <p className="page-drawer-section-empty">
                      Created editions open in Market.
                    </p>
                  ) : null}
                  <PageDrawerCreatedSeeAll pageAccountId={pageAccountId} />
                </div>
              ) : null}

              {showHoldings ? (
                <div className="page-drawer-peek-stack">
                  <PageDrawerHoldingsRail holdings={orderedHoldings} />
                  <PageDrawerHoldingsSeeAll pageAccountId={pageAccountId} />
                </div>
              ) : null}

              {showLinks ? <PageDrawerLinksList links={links} /> : null}

              {showGuildRail ? (
                <PageDrawerGuilds guilds={orderedGuilds} />
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
