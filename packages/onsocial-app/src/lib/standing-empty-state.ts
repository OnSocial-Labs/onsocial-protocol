import type { StanceDetailKind } from '@/lib/profile-social-standings';

export interface StandingPanelEmptyState {
  primary: string;
  secondary?: string;
  showClearSearch: boolean;
  showDiscover: boolean;
}

function quoteSearchQuery(query: string): string {
  return `"${query}"`;
}

export function buildStandingSearchEmptyPrimary(
  kind: StanceDetailKind,
  isSelf: boolean,
  displayName: string,
  query: string
): string {
  const quoted = quoteSearchQuery(query);

  if (kind === 'mutual') {
    return `No solidarity matches ${quoted}.`;
  }

  if (kind === 'incoming') {
    return isSelf
      ? `No matches for ${quoted} among people standing with you.`
      : `No matches for ${quoted} among people standing with ${displayName}.`;
  }

  return isSelf
    ? `No matches for ${quoted} among people you stand with.`
    : `No matches for ${quoted} among people ${displayName} stands with.`;
}

export function buildStandingEmptyState({
  kind,
  isSelf,
  displayName,
  query,
  showDiscoverLink,
}: {
  kind: StanceDetailKind;
  isSelf: boolean;
  displayName: string;
  query: string;
  showDiscoverLink: boolean;
}): StandingPanelEmptyState {
  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    return {
      primary: buildStandingSearchEmptyPrimary(
        kind,
        isSelf,
        displayName,
        trimmedQuery
      ),
      secondary: 'Try another name or handle.',
      showClearSearch: true,
      showDiscover: showDiscoverLink,
    };
  }

  if (kind === 'mutual') {
    return {
      primary: 'No solidarity yet.',
      showClearSearch: false,
      showDiscover: showDiscoverLink,
    };
  }

  if (kind === 'incoming') {
    return {
      primary: isSelf
        ? 'No one stands with you yet.'
        : `No one stands with ${displayName} yet.`,
      showClearSearch: false,
      showDiscover: showDiscoverLink,
    };
  }

  return {
    primary: isSelf
      ? 'You do not stand with anyone yet.'
      : `${displayName} does not stand with anyone yet.`,
    showClearSearch: false,
    showDiscover: showDiscoverLink,
  };
}
