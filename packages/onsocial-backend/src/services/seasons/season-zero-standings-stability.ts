import type { SeasonZeroStanding } from './season-zero-standings.js';

export const SEASON_ZERO_STANDINGS_STABILITY_DELAY_MS = 750;

export interface SeasonZeroStandingsSnapshotRow {
  accountId: string;
  rank: number;
  score: number;
}

export function seasonZeroStandingsSnapshot(
  standings: SeasonZeroStanding[]
): SeasonZeroStandingsSnapshotRow[] {
  return standings.map((standing) => ({
    accountId: standing.accountId,
    rank: standing.rank,
    score: standing.score,
  }));
}

export function areSeasonZeroStandingsStable(
  left: SeasonZeroStanding[],
  right: SeasonZeroStanding[]
): boolean {
  const a = seasonZeroStandingsSnapshot(left);
  const b = seasonZeroStandingsSnapshot(right);
  if (a.length !== b.length) return false;
  return a.every(
    (row, index) =>
      row.accountId === b[index]?.accountId &&
      row.rank === b[index]?.rank &&
      row.score === b[index]?.score
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
