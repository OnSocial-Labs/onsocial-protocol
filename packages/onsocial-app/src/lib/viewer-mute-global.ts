import type { ViewerMuteLedger } from '@/lib/viewer-mute-ledger';

const globalLedger: ViewerMuteLedger = new Map();
const globalPendingTargets = new Set<string>();
const globalApiMuted = new Set<string>();
let globalLedgerVersion = 0;
const listeners = new Set<() => void>();

export function getGlobalViewerMuteLedger(): ViewerMuteLedger {
  return globalLedger;
}

export function getGlobalViewerMuteLedgerVersion(): number {
  return globalLedgerVersion;
}

export function getGlobalApiMutedIds(): string[] {
  return Array.from(globalApiMuted);
}

export function setGlobalApiMutedIds(ids: readonly string[]): void {
  globalApiMuted.clear();
  for (const id of ids) {
    globalApiMuted.add(id.toLowerCase());
  }
  bumpGlobalViewerMuteLedger();
}

export function isGlobalMutePending(targetAccountId: string): boolean {
  return globalPendingTargets.has(targetAccountId);
}

export function setGlobalMutePending(
  targetAccountId: string,
  pending: boolean
): void {
  if (pending) globalPendingTargets.add(targetAccountId);
  else globalPendingTargets.delete(targetAccountId);
  bumpGlobalViewerMuteLedger();
}

export function bumpGlobalViewerMuteLedger(): void {
  globalLedgerVersion += 1;
  for (const listener of listeners) listener();
}

export function subscribeGlobalViewerMuteLedger(
  listener: () => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearGlobalViewerMuteState(): void {
  globalLedger.clear();
  globalPendingTargets.clear();
  globalApiMuted.clear();
  bumpGlobalViewerMuteLedger();
}
