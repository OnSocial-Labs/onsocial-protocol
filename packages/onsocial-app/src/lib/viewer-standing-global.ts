import type { ViewerStandingLedger } from '@/lib/viewer-standing-ledger';

const globalLedger: ViewerStandingLedger = new Map();
let globalLedgerVersion = 0;
const listeners = new Set<() => void>();

export function getGlobalViewerStandingLedger(): ViewerStandingLedger {
  return globalLedger;
}

export function getGlobalViewerStandingLedgerVersion(): number {
  return globalLedgerVersion;
}

export function bumpGlobalViewerStandingLedger(): void {
  globalLedgerVersion += 1;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeGlobalViewerStandingLedger(
  listener: () => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
