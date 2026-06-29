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

  if (trimmedQuery) {
    return {
      primary: buildDiscoverSearchEmptyPrimary(trimmedQuery),
      secondary: 'Try another name or account.',
      showClearSearch: true,
    };
  }

  return {
    primary: 'No profiles found yet.',
    showClearSearch: false,
  };
}
