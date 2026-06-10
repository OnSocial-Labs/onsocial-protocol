const SEASON_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function normalizeSeasonId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const seasonId = value.trim().toLowerCase();
  return SEASON_ID_PATTERN.test(seasonId) ? seasonId : null;
}

export function assertSeasonId(value: unknown): string {
  const seasonId = normalizeSeasonId(value);
  if (!seasonId) {
    throw new Error('Invalid season_id');
  }
  return seasonId;
}
