import type { PageSection } from '@onsocial/sdk';
import type { PublicPageConfig, PublicPageStats } from '@/lib/page-data';

export const PAGE_SECTION_LABELS: Record<PageSection, string> = {
  profile: 'Profile',
  links: 'Links',
  support: 'Support',
  posts: 'Posts',
  events: 'Events',
  collectibles: 'Collectibles',
  badges: 'Badges',
  groups: 'Groups',
};

export const PAGE_SECTION_DESCRIPTIONS: Record<PageSection, string> = {
  profile: 'Bio, tags, and how they show up.',
  links: 'Outbound links from their profile.',
  support: 'Support and tipping.',
  posts: 'Public posts and updates.',
  events: 'Events they host or attend.',
  collectibles: 'Scarces and collectibles.',
  badges: 'Earned badges and credentials.',
  groups: 'Groups they belong to.',
};

const DEFAULT_PAGE_SECTIONS: PageSection[] = [
  'posts',
  'collectibles',
  'links',
  'badges',
];

const PAGE_SECTION_SET = new Set<string>(Object.keys(PAGE_SECTION_LABELS));

function isPageSection(value: string): value is PageSection {
  return PAGE_SECTION_SET.has(value);
}

/** Owner-configured sections for the page drawer, with sensible defaults. */
export function resolvePageSections(config: PublicPageConfig): PageSection[] {
  const configured = (config.sections ?? [])
    .filter(isPageSection)
    .filter((section) => section !== 'profile');

  if (configured.length > 0) {
    return configured;
  }

  return DEFAULT_PAGE_SECTIONS;
}

export function pageSectionCountHint(
  section: PageSection,
  stats: PublicPageStats
): string | null {
  switch (section) {
    case 'posts':
      return stats.postCount > 0 ? String(stats.postCount) : null;
    case 'badges':
      return stats.badgeCount > 0 ? String(stats.badgeCount) : null;
    case 'groups':
      return stats.groupCount > 0 ? String(stats.groupCount) : null;
    case 'collectibles':
      return stats.badgeCount > 0 ? String(stats.badgeCount) : null;
    default:
      return null;
  }
}
