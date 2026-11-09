import type { DiscoverFaceFilter } from '@onsocial/sdk';
import { isDiscoverTopicDraft } from '@/features/discover/discover-omni-search';
import { profileIdentityTopicLabel } from '@/lib/profile-identity-topics';

export interface DiscoverPanelEmptyState {
  primary: string;
  secondary?: string;
  showClearSearch: boolean;
}

function quoteSearchQuery(query: string): string {
  return `"${query}"`;
}

export function buildDiscoverSearchEmptyPrimary(query: string): string {
  return `No matches for ${quoteSearchQuery(query)} on the graph.`;
}

export function buildDiscoverEmptyState(
  query: string,
  face: DiscoverFaceFilter = 'all',
  industry = '',
  craft = ''
): DiscoverPanelEmptyState {
  const trimmedQuery = query.trim();
  const craftSlug = craft.trim();

  if (isDiscoverTopicDraft(trimmedQuery)) {
    return {
      primary: 'Press Enter or pick a suggestion to open this in Home.',
      secondary: 'Topics and tickers live in the Home feed.',
      showClearSearch: false,
    };
  }

  if (craftSlug && !trimmedQuery) {
    return {
      primary: `No people tagged ${profileIdentityTopicLabel(craftSlug)} yet.`,
      secondary: 'Crafts come from About on profiles.',
      showClearSearch: false,
    };
  }

  if (trimmedQuery) {
    if (face === 'offers') {
      return {
        primary: 'No matching offers.',
        showClearSearch: false,
      };
    }
    if (face === 'hiring') {
      return {
        primary: industry
          ? `No roles matching in ${industry}.`
          : 'No matching roles.',
        showClearSearch: false,
      };
    }
    return {
      primary: 'No matches.',
      showClearSearch: false,
    };
  }

  if (face === 'offers') {
    return {
      primary: 'No offers yet.',
      showClearSearch: false,
    };
  }
  if (face === 'hiring') {
    return {
      primary: industry
        ? `No orgs hiring in ${industry} yet.`
        : 'No orgs hiring yet.',
      showClearSearch: false,
    };
  }
  if (face === 'orgs') {
    return {
      primary: industry
        ? `No organizations in ${industry} yet.`
        : 'No organizations found.',
      showClearSearch: false,
    };
  }
  if (face === 'daos') {
    return {
      primary: industry ? `No DAOs in ${industry} yet.` : 'No DAOs found.',
      showClearSearch: false,
    };
  }
  if (face === 'people') {
    return {
      primary: 'No people found.',
      showClearSearch: false,
    };
  }
  if (industry) {
    return {
      primary: `No profiles in ${industry} yet.`,
      showClearSearch: false,
    };
  }

  return {
    primary: 'No profiles found yet.',
    showClearSearch: false,
  };
}

const DISCOVER_EMPTY_LINES: Record<string, string> = {
  'Press Enter or pick a suggestion to open this in Home.':
    'discover.pressEnter',
  'Topics and tickers live in the Home feed.': 'discover.topicsLiveInHome',
  'Crafts come from About on profiles.': 'discover.craftsFromAbout',
  'No matching offers.': 'discover.noMatchingOffers',
  'No matching roles.': 'discover.noMatchingRoles',
  'No matches.': 'discover.noMatches',
  'No offers yet.': 'discover.noOffersYet',
  'No orgs hiring yet.': 'discover.noOrgsHiring',
  'No organizations found.': 'discover.noOrganizations',
  'No DAOs found.': 'discover.noDaosFound',
  'No people found.': 'discover.noPeopleFound',
  'No profiles found yet.': 'discover.noProfilesYet',
};

const DISCOVER_EMPTY_PATTERNS: Array<{
  re: RegExp;
  key: string;
}> = [
  { re: /^No people tagged (.+) yet\.$/, key: 'discover.taggedPeople' },
  { re: /^No roles matching in (.+)\.$/, key: 'discover.rolesIn' },
  { re: /^No orgs hiring in (.+) yet\.$/, key: 'discover.hiringInIndustry' },
  { re: /^No organizations in (.+) yet\.$/, key: 'discover.orgsInIndustry' },
  { re: /^No DAOs in (.+) yet\.$/, key: 'discover.daosInIndustry' },
  { re: /^No profiles in (.+) yet\.$/, key: 'discover.profilesInIndustry' },
];

/** Known empty lines. The captured name stays stored; display translates known ones. */
export function discoverEmptyLine(message: string): {
  key: string;
  values?: { name: string };
} | null {
  const fixed = DISCOVER_EMPTY_LINES[message];
  if (fixed) return { key: fixed };
  for (const pattern of DISCOVER_EMPTY_PATTERNS) {
    const match = pattern.re.exec(message);
    if (match?.[1]) return { key: pattern.key, values: { name: match[1] } };
  }
  return null;
}
