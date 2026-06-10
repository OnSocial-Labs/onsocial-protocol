/** On-chain season id for archived Genesis Rally (Season 0). */
export const ARCHIVED_GENESIS_SEASON_ID = 'season-zero';

export interface SeasonPresentation {
  seasonId: string;
  /** Primary nav label when this season is active; null when archived only. */
  menuLabel: string | null;
  navDescription: string;
  pageBadge: string;
  pageTitle: string;
  pageDescription: string;
  profileBadgeLabel: string;
  rallyPath: string;
  archived: boolean;
}

const SEASON_CATALOG: Record<
  string,
  Omit<SeasonPresentation, 'seasonId' | 'rallyPath'> & { rallyPath?: string }
> = {
  'season-zero': {
    menuLabel: null,
    navDescription: 'Season 0 archive',
    pageBadge: 'Season 0',
    pageTitle: 'Genesis Rally',
    pageDescription: 'Let the social games begin.',
    profileBadgeLabel: 'Genesis',
    rallyPath: '/season-zero',
    archived: true,
  },
  'season-one': {
    menuLabel: 'OnSocial Rally',
    navDescription: 'Live standings, earn points, claim rewards',
    pageBadge: 'Live',
    pageTitle: 'OnSocial Rally',
    pageDescription: 'Join the live season, earn points, and claim your share.',
    profileBadgeLabel: 'Rally',
    archived: false,
  },
};

function catalogEntry(seasonId: string) {
  return SEASON_CATALOG[seasonId];
}

/** Display metadata for a season page, nav badge, or profile chip. */
export function getSeasonPresentation(seasonId: string): SeasonPresentation {
  const entry = catalogEntry(seasonId);
  if (entry) {
    return {
      seasonId,
      rallyPath: entry.rallyPath ?? '/season',
      ...entry,
    };
  }

  return {
    seasonId,
    menuLabel: 'OnSocial Rally',
    navDescription: 'Live standings & rewards',
    pageBadge: 'Live',
    pageTitle: seasonId,
    pageDescription: 'Join the live season, earn points, and claim your share.',
    profileBadgeLabel: 'Rally',
    rallyPath: '/season',
    archived: false,
  };
}

/** Primary rally season for joins, home promo, and admin ops. */
export function getActiveSeasonId(): string {
  const configured = process.env.NEXT_PUBLIC_ACTIVE_SEASON_ID?.trim();
  return configured || 'season-one';
}

/** Server-side active season (portal admin routes, SSR). */
export function getServerActiveSeasonId(): string {
  const configured =
    process.env.ACTIVE_SEASON_ID?.trim() ||
    process.env.NEXT_PUBLIC_ACTIVE_SEASON_ID?.trim();
  return configured || 'season-one';
}

export function getActiveSeasonPresentation(): SeasonPresentation {
  return getSeasonPresentation(getActiveSeasonId());
}

export function seasonApiPath(seasonId: string, suffix: string): string {
  return `/api/seasons/${encodeURIComponent(seasonId)}/${suffix}`;
}
