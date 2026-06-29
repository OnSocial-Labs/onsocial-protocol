import { Fragment } from 'react';
import type { PageSection } from '@onsocial/sdk';
import { Divider } from '@onsocial/ui';
import { PAGE_SECTION_LABELS, pageSectionCountHint } from '@/lib/page-sections';
import type { PublicPageStats } from '@/lib/page-data';

interface PageContentSectionsProps {
  sections: PageSection[];
  stats: PublicPageStats;
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
      return 'Groups will appear here.';
    default:
      return 'Content will appear here.';
  }
}

export function PageContentSections({
  sections,
  stats,
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
            </section>
          </Fragment>
        );
      })}
    </div>
  );
}
