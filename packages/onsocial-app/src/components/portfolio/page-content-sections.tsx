'use client';

import { Fragment, useCallback, useMemo } from 'react';
import Link from 'next/link';
import type { PageSection } from '@onsocial/sdk';
import { Divider, ProtocolMotionArrow } from '@onsocial/ui';
import { GuildSummaryCard } from '@/features/guilds/guild-summary-card';
import { PortfolioLinkIcon } from '@/components/portfolio/portfolio-link-icon';
import {
  PageDrawerPostPeekList,
  PageDrawerScarcePeekRail,
} from '@/components/portfolio/page-drawer-peeks';
import {
  PAGE_DRAWER_GUILD_PEEK,
  PAGE_SECTION_LABELS,
  pageDrawerJumpSections,
  pageDrawerSectionDomId,
  pageSectionCountHint,
  resolveVisiblePageSections,
} from '@/lib/page-sections';
import type {
  ProfilePostPeek,
  ProfileScarcePeek,
} from '@/lib/fetch-profile-peeks';
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
  scarcePeeks?: ProfileScarcePeek[];
  scarceCount?: number;
  /** Sheet body scroller — jump chips scroll this, not the window. */
  scrollRoot?: HTMLElement | null;
  /** Fired when a jump chip scrolls the body (keeps the gesture pill visible). */
  onSectionJump?: () => void;
}

function PageDrawerJumpRail({
  sections,
  onJump,
}: {
  sections: PageSection[];
  onJump: (section: PageSection) => void;
}) {
  if (sections.length < 2) {
    return null;
  }

  return (
    <nav className="page-drawer-jump" aria-label="Page sections">
      {sections.map((section) => (
        <button
          key={section}
          type="button"
          className="page-drawer-jump-chip"
          onClick={() => onJump(section)}
        >
          {PAGE_SECTION_LABELS[section]}
        </button>
      ))}
    </nav>
  );
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
  scarcePeeks = [],
  scarceCount = 0,
  scrollRoot = null,
  onSectionJump,
}: PageContentSectionsProps) {
  const links = useMemo(
    () => resolvePortfolioSocialLinks(profileLinks),
    [profileLinks]
  );

  const effectiveScarceCount = Math.max(scarceCount, scarcePeeks.length);

  const sections = useMemo(
    () =>
      resolveVisiblePageSections(config, {
        stats,
        guilds,
        links,
        scarceCount: effectiveScarceCount,
        postPeekCount: postPeeks.length,
      }),
    [config, stats, guilds, links, effectiveScarceCount, postPeeks.length]
  );

  const jumpSections = useMemo(
    () => pageDrawerJumpSections(sections),
    [sections]
  );

  const handleJump = useCallback(
    (section: PageSection) => {
      const node = document.getElementById(pageDrawerSectionDomId(section));
      if (!node) return;

      onSectionJump?.();

      const scroller = scrollRoot;
      if (!scroller) {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      /*
       * Scroll the sheet body only. `scrollIntoView` leaves a dead band under
       * short sections and can fight the floating pill overlay.
       */
      const scrollerRect = scroller.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      const nextTop = scroller.scrollTop + (nodeRect.top - scrollerRect.top);
      const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTo({
        top: Math.min(Math.max(0, nextTop), maxTop),
        behavior: 'smooth',
      });
    },
    [onSectionJump, scrollRoot]
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
      <PageDrawerJumpRail sections={jumpSections} onJump={handleJump} />

      {sections.map((section, index) => {
        const count = pageSectionCountHint(section, stats, {
          scarceCount: effectiveScarceCount,
        });
        const showGuildRail = section === 'groups' && peekGuilds.length > 0;
        const showLinks = section === 'links' && links.length > 0;
        const showPosts = section === 'posts';
        const showScarces =
          section === 'collectibles' && scarcePeeks.length > 0;

        return (
          <Fragment key={section}>
            {index > 0 || jumpSections.length >= 2 ? (
              <Divider variant="detail" />
            ) : null}
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

              {showScarces ? (
                <PageDrawerScarcePeekRail scarces={scarcePeeks} />
              ) : null}

              {section === 'collectibles' && scarcePeeks.length === 0 ? (
                <p className="page-drawer-section-empty">
                  Collectibles will show here when indexed.
                </p>
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
