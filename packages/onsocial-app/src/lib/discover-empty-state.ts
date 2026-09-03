import type { DiscoverFaceFilter } from '@onsocial/sdk';
import { isDiscoverTopicDraft } from '@/features/discover/discover-omni-search';

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
  industry = ''
): DiscoverPanelEmptyState {
  const trimmedQuery = query.trim();

  if (isDiscoverTopicDraft(trimmedQuery)) {
    return {
      primary: 'Press Enter or pick a suggestion to open this in Home.',
      secondary: 'Topics and tickers live in the Home feed.',
      showClearSearch: false,
    };
  }

  if (trimmedQuery) {
    return {
      primary: 'No matches.',
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
