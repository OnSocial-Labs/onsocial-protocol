import type { ViewerEndorsementLedger } from '@/lib/viewer-endorsement-ledger';

const globalLedger: ViewerEndorsementLedger = new Map();
const globalPendingTargets = new Set<string>();
let globalLedgerVersion = 0;
const listeners = new Set<() => void>();

export function getGlobalViewerEndorsementLedger(): ViewerEndorsementLedger {
  return globalLedger;
}

export function getGlobalViewerEndorsementLedgerVersion(): number {
  return globalLedgerVersion;
}

export function isGlobalEndorsePending(targetAccountId: string): boolean {
  return globalPendingTargets.has(targetAccountId);
}

export function setGlobalEndorsePending(
  targetAccountId: string,
  pending: boolean
): void {
  if (pending) {
    globalPendingTargets.add(targetAccountId);
  } else {
    globalPendingTargets.delete(targetAccountId);
  }
  bumpGlobalViewerEndorsementLedger();
}

export function bumpGlobalViewerEndorsementLedger(): void {
  globalLedgerVersion += 1;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeGlobalViewerEndorsementLedger(
  listener: () => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
