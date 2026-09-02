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

export function buildDiscoverEmptyState(query: string): DiscoverPanelEmptyState {
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

  return {
    primary: 'No profiles found yet.',
    showClearSearch: false,
  };
}
