/** On-chain season id for archived Genesis Rally (Season 0). */
export const ARCHIVED_GENESIS_SEASON_ID = 'season-zero';

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

export function seasonApiPath(seasonId: string, suffix: string): string {
  return `/api/seasons/${encodeURIComponent(seasonId)}/${suffix}`;
}
