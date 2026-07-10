'use client';

import type { PageSection } from '@onsocial/sdk';
import { PAGE_SECTION_LABELS } from '@/lib/page-sections';

interface PageDrawerJumpRailProps {
  sections: PageSection[];
  activeSection: PageSection | null;
  onJump: (section: PageSection) => void;
}

/** Compact section chips — lives in drawer header chrome. */
export function PageDrawerJumpRail({
  sections,
  activeSection,
  onJump,
}: PageDrawerJumpRailProps) {
  if (sections.length < 2) {
    return null;
  }

  return (
    <nav className="page-drawer-jump" aria-label="Page sections">
      {sections.map((section) => {
        const isActive = activeSection === section;
        return (
          <button
            key={section}
            type="button"
            className={`page-drawer-jump-chip${isActive ? ' is-active' : ''}`}
            aria-current={isActive ? 'true' : undefined}
            onClick={() => onJump(section)}
          >
            {PAGE_SECTION_LABELS[section]}
          </button>
        );
      })}
    </nav>
  );
}
