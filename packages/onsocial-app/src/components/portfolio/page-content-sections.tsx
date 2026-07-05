import { Fragment } from 'react';
import Link from 'next/link';
import type { PageSection } from '@onsocial/sdk';
import { Divider } from '@onsocial/ui';
import { PAGE_SECTION_LABELS, pageSectionCountHint } from '@/lib/page-sections';
import type { PublicPageStats } from '@/lib/page-data';
import type { ProfileGuildSummary } from '@/lib/profile-guilds';
import { APP_GROUPS_PATH } from '@/lib/app-routes';
import { guildPath } from '@/features/guilds/guilds-data';

interface PageContentSectionsProps {
  sections: PageSection[];
  stats: PublicPageStats;
  guilds?: ProfileGuildSummary[];
}

function sectionEmptyCopy(section: PageSection): string {
  switch (section) {
    case 'posts':
      return 'Posts will appear here.';
    case 'collectibles':
      return 'Collectibles will appear here.';
    case 'links':
      return 'Links will appear here.';
    case 'badges':
      return 'Badges will appear here.';
    case 'support':
      return 'Support options will appear here.';
    case 'events':
      return 'Events will appear here.';
    case 'groups':
      return 'Guilds will appear here.';
    default:
      return 'Content will appear here.';
  }
}

export function PageContentSections({
  sections,
  stats,
  guilds = [],
}: PageContentSectionsProps) {
  return (
    <div className="page-drawer-sections">
      {sections.map((section, index) => {
        const count = pageSectionCountHint(section, stats);

        return (
          <Fragment key={section}>
            {index > 0 ? <Divider variant="detail" /> : null}
            <section className="page-drawer-section">
              <header className="page-drawer-section-header">
                <h3 className="page-drawer-section-title">
                  {PAGE_SECTION_LABELS[section]}
                </h3>
                {count ? (
                  <span className="page-drawer-section-count">{count}</span>
                ) : null}
              </header>
              <p className="page-drawer-section-empty">
                {sectionEmptyCopy(section)}
              </p>
              {section === 'groups' && guilds.length > 0 ? (
                <div className="page-drawer-guild-list">
                  {guilds.map((guild) => (
                    <Link
                      key={guild.groupId}
                      className="page-drawer-guild-link"
                      href={guildPath(guild.groupId)}
                    >
                      <span className="page-drawer-guild-name">
                        {guild.name}
                      </span>
                      <span className="page-drawer-guild-meta">
                        {guild.role} ·{' '}
                        {guild.accessGated ? 'Access-gated' : 'Open access'}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : null}
              {section === 'groups' ? (
                <Link
                  className="page-drawer-section-action"
                  href={APP_GROUPS_PATH}
                >
                  {guilds.length > 0 ? 'Browse all guilds' : 'Open Guilds'}
                </Link>
              ) : null}
            </section>
          </Fragment>
        );
      })}
    </div>
  );
}
