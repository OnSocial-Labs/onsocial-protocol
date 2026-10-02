/**
 * Pure rally claim-open notification planning.
 *
 * Kept db-free so unit tests import this module directly; the emit module
 * owns persistence. Rows are normalized (lowercase, deduped, positive
 * amounts only) so re-runs stay idempotent behind the dedupe key.
 */

export const SEASON_CLAIM_OPEN_TYPE = 'season_claim_open' as const;

export interface SeasonClaimOpenRow {
  accountId: string;
  amount: string;
  rank: number;
}

export function buildSeasonClaimOpenRows(
  claims: Array<{ account_id: string; amount: string; rank: number | string }>
): SeasonClaimOpenRow[] {
  const seen = new Set<string>();
  const rows: SeasonClaimOpenRow[] = [];
  for (const claim of claims) {
    const accountId = claim.account_id?.trim().toLowerCase();
    if (!accountId || seen.has(accountId)) continue;
    const amount = String(claim.amount ?? '').trim();
    if (!/^\d+$/.test(amount) || amount === '0') continue;
    const rank = Number(claim.rank);
    seen.add(accountId);
    rows.push({
      accountId,
      amount,
      rank: Number.isFinite(rank) && rank > 0 ? Math.floor(rank) : 0,
    });
  }
  return rows;
}

export function seasonClaimOpenDedupeKey(
  seasonId: string,
  accountId: string
): string {
  return `season_claim_open:${seasonId}:${accountId}`;
}
