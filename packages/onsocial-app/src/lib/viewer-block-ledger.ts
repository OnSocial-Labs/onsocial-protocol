/** Confirmed block overrides until indexer reads catch up. */
export type ViewerBlockLedger = Map<string, boolean>;

export function recordViewerBlock(
  ledger: ViewerBlockLedger,
  targetAccountId: string,
  blocked: boolean
): void {
  ledger.set(targetAccountId.trim().toLowerCase(), blocked);
}

export function resolveViewerBlock(
  ledger: ViewerBlockLedger,
  targetAccountId: string,
  apiBlocked: boolean
): boolean {
  const entry = ledger.get(targetAccountId.trim().toLowerCase());
  if (entry === undefined) return apiBlocked;
  return entry;
}

export function reconcileViewerBlock(
  ledger: ViewerBlockLedger,
  targetAccountId: string,
  apiBlocked: boolean
): boolean {
  const key = targetAccountId.trim().toLowerCase();
  const entry = ledger.get(key);
  if (entry === undefined || entry !== apiBlocked) return false;
  return ledger.delete(key);
}

export function deriveBlockedAccountIds(
  apiBlockedIds: readonly string[],
  ledger: ViewerBlockLedger
): string[] {
  const set = new Set(apiBlockedIds.map((id) => id.toLowerCase()));
  for (const [accountId, blocked] of ledger) {
    const key = accountId.toLowerCase();
    if (blocked) set.add(key);
    else set.delete(key);
  }
  return Array.from(set);
}
