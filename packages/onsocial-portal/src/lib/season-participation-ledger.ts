import type { SeasonZeroClaimRecord } from '@/features/season/season-zero-types';
import type { ArchiveSeasonClaimHint } from '@/features/season/season-archive-claim-hints';

export type SeasonClaimLedger = Map<string, true>;
export type SeasonJoinLedger = Map<string, true>;

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
  if (!apiClaimed) {
    return false;
  }
  return ledger.delete(seasonId);
}

export function deriveSeasonClaimRecord(
  claim: SeasonZeroClaimRecord | null | undefined,
  ledger: SeasonClaimLedger
): SeasonZeroClaimRecord | null {
  if (!claim) {
    return null;
  }
  if (claim.claimed || !ledger.has(claim.seasonId)) {
    return claim;
  }
  return { ...claim, claimed: true };
}

export function resolveArchiveSeasonClaimHint(
  seasonId: string,
  apiHint: ArchiveSeasonClaimHint,
  ledger: SeasonClaimLedger
): ArchiveSeasonClaimHint {
  if (ledger.has(seasonId)) {
    return 'collected';
  }
  return apiHint;
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
  if (ledger.has(seasonId)) {
    return true;
  }
  return apiJoined;
}

export function reconcileSeasonJoined(
  ledger: SeasonJoinLedger,
  seasonId: string,
  apiJoined: boolean
): boolean {
  if (!apiJoined) {
    return false;
  }
  return ledger.delete(seasonId);
}
