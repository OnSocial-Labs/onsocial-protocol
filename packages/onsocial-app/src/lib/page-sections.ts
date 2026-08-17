import type { PageSection } from '@onsocial/sdk';
import { formatCompactCount } from '@/lib/page-drawer-meta';
import type { PublicPageConfig, PublicPageStats } from '@/lib/page-data';
import type { ProfileGuildSummary } from '@/lib/profile-guilds';
import type { PortfolioSocialLink } from '@/lib/profile-social-links';

export const PAGE_SECTION_LABELS: Record<PageSection, string> = {
  profile: 'Profile',
  links: 'Links',
  support: 'Support',
  posts: 'Posts',
  events: 'Events',
  store: 'Store',
  created: 'Created',
  collectibles: 'Collectibles',
  badges: 'Badges',
  groups: 'Guilds',
};

export const PAGE_SECTION_DESCRIPTIONS: Record<PageSection, string> = {
  profile: 'Quiet about line and labels in the page drawer.',
  links: 'Outbound links from their profile.',
  support: 'Support and tipping.',
  posts: 'Public posts and updates.',
  events: 'Events they host or attend.',
  store: 'Scarces they have for sale right now.',
  created: 'Editions they minted — public showcase.',
  collectibles: 'Editions they hold — tickets, writing, music, and more.',
  badges: 'Earned badges and credentials.',
  groups: 'Guilds they belong to.',
};

/** Visitor-friendly defaults — browse chapters only; gestures sit after. */
export const DEFAULT_PAGE_SECTIONS: PageSection[] = [
  'posts',
  'store',
  'created',
  'groups',
  'links',
  'collectibles',
];

/** Max guild cards in the drawer rail before “See all”. */
export const PAGE_DRAWER_GUILD_PEEK = 6;

const PAGE_SECTION_SET = new Set<string>(Object.keys(PAGE_SECTION_LABELS));

export function isPageSection(value: string): value is PageSection {
  return PAGE_SECTION_SET.has(value);
}

/**
 * Owner-configured Launch chapters.
 * Empty → defaults. Explicit list is honored (omit a chapter to hide it).
 */
export function resolvePageSections(config: PublicPageConfig): PageSection[] {
  const configured = (config.sections ?? [])
    .filter(isPageSection)
    .filter((section) => section !== 'profile' && section !== 'support');

  if (configured.length === 0) {
    return [...DEFAULT_PAGE_SECTIONS];
  }

  return configured;
}

export function pageSectionCountHint(
  section: PageSection,
  stats: PublicPageStats,
  options: {
    scarceCount?: number;
    createdCount?: number;
    createdCountHint?: number;
    storeListingCount?: number;
  } = {}
): string | null {
  switch (section) {
    case 'posts':
      return stats.postCount > 0 ? formatCompactCount(stats.postCount) : null;
    case 'badges':
      return stats.badgeCount > 0 ? formatCompactCount(stats.badgeCount) : null;
    case 'groups':
      return stats.groupCount > 0 ? formatCompactCount(stats.groupCount) : null;
    case 'store': {
      const storeCount = options.storeListingCount ?? 0;
      return storeCount > 0 ? formatCompactCount(storeCount) : null;
    }
    case 'created': {
      const createdCount =
        options.createdCountHint ?? options.createdCount ?? 0;
      return createdCount > 0 ? formatCompactCount(createdCount) : null;
    }
    case 'collectibles': {
      const scarceCount = options.scarceCount ?? 0;
      return scarceCount > 0 ? formatCompactCount(scarceCount) : null;
    }
    default:
      return null;
  }
}

export interface PageSectionVisibilityInput {
  stats: PublicPageStats;
  guilds: ProfileGuildSummary[];
  links: PortfolioSocialLink[];
  /** Owner wallet holdings count for Collectibles visibility. */
  scarceCount?: number;
  /** Public Created visibility (peeks and/or indexed mint count). */
  createdCount?: number;
  /** Count chip for Created — may be higher than the peek rail. */
  createdCountHint?: number;
  /** Live listings from this account for Store shelf visibility. */
  storeListingCount?: number;
  /** Recent post peeks already loaded for the drawer. */
  postPeekCount?: number;
}

/** Hide empty showcase sections. Support is a post-content gesture, not a section. */
export function isPageSectionVisible(
  section: PageSection,
  input: PageSectionVisibilityInput
): boolean {
  switch (section) {
    case 'posts':
      return (
        input.stats.postCount > 0 || (input.postPeekCount ?? 0) > 0
      );
    case 'groups':
      return input.guilds.length > 0 || input.stats.groupCount > 0;
    case 'store':
      return (input.storeListingCount ?? 0) > 0;
    case 'created':
      return (input.createdCount ?? 0) > 0;
    case 'collectibles':
      // On-chain holdings are public — Launch is the flex surface for visitors too.
      return (input.scarceCount ?? 0) > 0;
    case 'badges':
    case 'events':
    case 'support':
    case 'profile':
      return false;
    case 'links':
      return input.links.length > 0;
    default:
      return false;
  }
}

export function resolveVisiblePageSections(
  config: PublicPageConfig,
  input: PageSectionVisibilityInput
): PageSection[] {
  return resolvePageSections(config).filter((section) =>
    isPageSectionVisible(section, input)
  );
}

/** Jump rail — browse chapters only. */
export function pageDrawerJumpSections(sections: PageSection[]): PageSection[] {
  return sections.filter(
    (section) => section !== 'support' && section !== 'profile'
  );
}

export function pageDrawerSectionDomId(section: PageSection): string {
  return `page-drawer-section-${section}`;
}

/**
 * Scroll-spy: last section whose top has crossed the marker.
 * When the scroller is pinned at the end, force the last section so short
 * trailing chapters still light up.
 */
export function resolvePageDrawerActiveSection(
  sections: PageSection[],
  sectionTops: number[],
  markerY: number,
  scrolledToEnd = false
): PageSection | null {
  if (sections.length === 0) {
    return null;
  }
  if (scrolledToEnd) {
    return sections[sections.length - 1]!;
  }

  let active = sections[0]!;
  for (let i = 0; i < sections.length; i++) {
    const top = sectionTops[i];
    if (top == null) continue;
    if (top <= markerY) {
      active = sections[i]!;
    }
  }
  return active;
}
