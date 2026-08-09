/** Confirmed mute overrides until gateway prefs catch up. */
export type ViewerMuteLedger = Map<string, boolean>;

export function recordViewerMute(
  ledger: ViewerMuteLedger,
  targetAccountId: string,
  muted: boolean
): void {
  ledger.set(targetAccountId.trim().toLowerCase(), muted);
}

export function resolveViewerMute(
  ledger: ViewerMuteLedger,
  targetAccountId: string,
  apiMuted: boolean
): boolean {
  const entry = ledger.get(targetAccountId.trim().toLowerCase());
  if (entry === undefined) return apiMuted;
  return entry;
}

export function reconcileViewerMute(
  ledger: ViewerMuteLedger,
  targetAccountId: string,
  apiMuted: boolean
): boolean {
  const key = targetAccountId.trim().toLowerCase();
  const entry = ledger.get(key);
  if (entry === undefined || entry !== apiMuted) return false;
  return ledger.delete(key);
}

export function deriveMutedAccountIds(
  apiMutedIds: readonly string[],
  ledger: ViewerMuteLedger
): string[] {
  const set = new Set(apiMutedIds.map((id) => id.toLowerCase()));
  for (const [accountId, muted] of ledger) {
    const key = accountId.toLowerCase();
    if (muted) set.add(key);
    else set.delete(key);
  }
  return Array.from(set);
}
