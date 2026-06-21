import type { SeasonPhase } from '@/lib/season-registry';

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
  phase?: SeasonPhase;
}

export interface SeasonPresentationSource {
  label?: string;
  phase?: SeasonPhase;
  rallyPath?: string;
}

const SEASON_CATALOG: Record<
  string,
  Omit<SeasonPresentation, 'seasonId' | 'rallyPath' | 'phase'> & {
    rallyPath?: string;
  }
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
    pageBadge: 'Rally',
    pageTitle: 'OnSocial Rally',
    pageDescription: 'Join the live season, earn points, and claim your share.',
    profileBadgeLabel: 'Rally',
    archived: false,
  },
};

function catalogEntry(seasonId: string) {
  return SEASON_CATALOG[seasonId];
}

function defaultRallyPath(seasonId: string): string {
  return seasonId === ARCHIVED_GENESIS_SEASON_ID
    ? '/season-zero'
    : `/season/${encodeURIComponent(seasonId)}`;
}

function phaseToBadge(
  phase: SeasonPhase,
  catalogBadge?: string,
  seasonId?: string
): string {
  if (seasonId === ARCHIVED_GENESIS_SEASON_ID && catalogBadge) {
    return catalogBadge;
  }

  switch (phase) {
    case 'live':
      return 'Live';
    case 'claim':
      return 'Claim';
    case 'upcoming':
      return 'Soon';
    default:
      return catalogBadge ?? 'Archive';
  }
}

/** Default display name for numbered seasons without a human on-chain label. */
export const DEFAULT_RALLY_DISPLAY_NAME = 'OnSocial Rally';

function isNumberedSeasonId(seasonId: string): boolean {
  return (
    /^season-(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/u.test(
      seasonId
    ) && seasonId !== ARCHIVED_GENESIS_SEASON_ID
  );
}

/** Hero title from on-chain label, with catalog fallback when label is the raw id. */
export function resolveSeasonHeroTitle(input: {
  seasonId: string;
  onChainLabel?: string | null;
  catalogTitle?: string | null;
}): { title: string; showSeasonId: boolean } {
  const id = input.seasonId.trim();
  const onChain = input.onChainLabel?.trim() || null;
  const catalog = input.catalogTitle?.trim() || null;
  const humanOnChain = onChain && onChain !== id ? onChain : null;

  let title: string;
  if (humanOnChain) {
    title = humanOnChain;
  } else if (catalog) {
    title = catalog;
  } else if (isNumberedSeasonId(id)) {
    title = DEFAULT_RALLY_DISPLAY_NAME;
  } else if (onChain) {
    title = onChain;
  } else {
    title = id;
  }

  return { title: title, showSeasonId: false };
}

export function getSeasonCatalogTitle(seasonId: string): string | null {
  return catalogEntry(seasonId)?.pageTitle ?? null;
}

/** Display metadata for a season page, nav badge, or profile chip. */
export function getSeasonPresentation(
  seasonId: string,
  source?: SeasonPresentationSource | null
): SeasonPresentation {
  const entry = catalogEntry(seasonId);
  const phase =
    source?.phase ??
    (entry?.archived
      ? ('archived' as SeasonPhase)
      : ('archived' as SeasonPhase));
  const archived =
    phase === 'archived' || phase === 'claim' || Boolean(entry?.archived);
  const pageTitle = source?.label?.trim() || entry?.pageTitle || seasonId;
  const rallyPath =
    source?.rallyPath ?? entry?.rallyPath ?? defaultRallyPath(seasonId);

  if (entry) {
    return {
      seasonId,
      rallyPath,
      phase,
      menuLabel: phase === 'live' ? (entry.menuLabel ?? pageTitle) : null,
      navDescription: entry.navDescription,
      pageBadge: phaseToBadge(phase, entry.pageBadge, seasonId),
      pageTitle,
      pageDescription: entry.pageDescription,
      profileBadgeLabel: entry.profileBadgeLabel,
      archived,
    };
  }

  return {
    seasonId,
    phase,
    menuLabel: phase === 'live' ? pageTitle : null,
    navDescription: archived
      ? 'Past rally season'
      : 'Live standings, earn points, claim rewards',
    pageBadge: phaseToBadge(phase, undefined, seasonId),
    pageTitle,
    pageDescription: archived
      ? 'Review standings and claims from a past rally season.'
      : 'Join the live season, earn points, and claim your share.',
    profileBadgeLabel: 'Rally',
    rallyPath,
    archived,
  };
}

/** Env override for active season; chain registry is preferred in client UI. */
export function getActiveSeasonId(): string {
  const configured = process.env.NEXT_PUBLIC_ACTIVE_SEASON_ID?.trim();
  return configured || 'season-one';
}

/** Server-side active season override (portal admin routes, SSR). */
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
