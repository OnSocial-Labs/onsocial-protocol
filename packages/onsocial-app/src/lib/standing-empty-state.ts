import type { StandingEntityFilter } from '@/lib/dao-standing-account';
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

function entityNoun(entityFilter: StandingEntityFilter): string {
  return entityFilter === 'daos' ? 'DAOs' : 'people';
}

export function buildStandingSearchEmptyPrimary(
  kind: StanceDetailKind,
  isSelf: boolean,
  displayName: string,
  query: string,
  entityFilter: StandingEntityFilter = 'people'
): string {
  const quoted = quoteSearchQuery(query);
  const noun = entityNoun(entityFilter);

  if (kind === 'mutual') {
    return entityFilter === 'daos'
      ? `No DAO solidarity matches ${quoted}.`
      : `No solidarity matches ${quoted}.`;
  }

  if (kind === 'incoming') {
    return isSelf
      ? `No matches for ${quoted} among ${noun} standing with you.`
      : `No matches for ${quoted} among ${noun} standing with ${displayName}.`;
  }

  return isSelf
    ? `No matches for ${quoted} among ${noun} you stand with.`
    : `No matches for ${quoted} among ${noun} ${displayName} stands with.`;
}

export function buildStandingEmptyState({
  kind,
  isSelf,
  displayName,
  query,
  showDiscoverLink,
  entityFilter = 'people',
}: {
  kind: StanceDetailKind;
  isSelf: boolean;
  displayName: string;
  query: string;
  showDiscoverLink: boolean;
  entityFilter?: StandingEntityFilter;
}): StandingPanelEmptyState {
  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    return {
      primary: buildStandingSearchEmptyPrimary(
        kind,
        isSelf,
        displayName,
        trimmedQuery,
        entityFilter
      ),
      secondary: 'Try another name or handle.',
      showClearSearch: true,
      showDiscover: showDiscoverLink,
    };
  }

  if (entityFilter === 'daos') {
    if (kind === 'mutual') {
      return {
        primary: 'No DAO solidarity yet.',
        secondary: 'Solidarity is between people — DAOs appear under Outgoing.',
        showClearSearch: false,
        showDiscover: false,
      };
    }
    if (kind === 'incoming') {
      return {
        primary: isSelf
          ? 'No DAOs stand with you yet.'
          : `No DAOs stand with ${displayName} yet.`,
        secondary: 'DAOs do not stand — people stand with DAOs.',
        showClearSearch: false,
        showDiscover: false,
      };
    }
    return {
      primary: isSelf
        ? 'You do not stand with any DAOs yet.'
        : `${displayName} does not stand with any DAOs yet.`,
      showClearSearch: false,
      showDiscover: false,
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
