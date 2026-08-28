export type SeasonClaimLedger = Map<string, true>;
export type SeasonJoinLedger = Map<string, true>;

export type RallyClaimRecord = {
  seasonId: string;
  claimed: boolean | null;
};

export function recordSeasonClaimed(
  ledger: SeasonClaimLedger,
  seasonId: string
): void {
  ledger.set(seasonId, true);
}

export function hasSeasonClaimOverride(
  ledger: SeasonClaimLedger,
  seasonId: string
): boolean {
  return ledger.has(seasonId);
}

export function reconcileSeasonClaimed(
  ledger: SeasonClaimLedger,
  seasonId: string,
  apiClaimed: boolean
): boolean {
  if (!apiClaimed) return false;
  return ledger.delete(seasonId);
}

export function deriveSeasonClaimRecord<T extends RallyClaimRecord>(
  claim: T | null | undefined,
  ledger: SeasonClaimLedger
): T | null {
  if (!claim) return null;
  if (claim.claimed || !ledger.has(claim.seasonId)) return claim;
  return { ...claim, claimed: true };
}

export function recordSeasonJoined(
  ledger: SeasonJoinLedger,
  seasonId: string
): void {
  ledger.set(seasonId, true);
}

export function hasSeasonJoinOverride(
  ledger: SeasonJoinLedger,
  seasonId: string
): boolean {
  return ledger.has(seasonId);
}

export function resolveSeasonJoined(
  ledger: SeasonJoinLedger,
  seasonId: string,
  apiJoined: boolean
): boolean {
  return ledger.has(seasonId) || apiJoined;
}

export function reconcileSeasonJoined(
  ledger: SeasonJoinLedger,
  seasonId: string,
  apiJoined: boolean
): boolean {
  if (!apiJoined) return false;
  return ledger.delete(seasonId);
}
