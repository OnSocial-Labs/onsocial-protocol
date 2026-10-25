import type { ViewerStandingLedger } from '@/lib/viewer-standing-ledger';

const globalLedger: ViewerStandingLedger = new Map();
const globalPendingTargets = new Set<string>();
let globalLedgerVersion = 0;
const listeners = new Set<() => void>();

export function getGlobalViewerStandingLedger(): ViewerStandingLedger {
  return globalLedger;
}

export function getGlobalViewerStandingLedgerVersion(): number {
  return globalLedgerVersion;
}

export function isGlobalStandingPending(targetAccountId: string): boolean {
  return globalPendingTargets.has(targetAccountId);
}

export function copyGlobalStandingPendingTargets(): Set<string> {
  return new Set(globalPendingTargets);
}

export function setGlobalStandingPending(
  targetAccountId: string,
  pending: boolean
): void {
  if (pending) {
    globalPendingTargets.add(targetAccountId);
  } else {
    globalPendingTargets.delete(targetAccountId);
  }
  bumpGlobalViewerStandingLedger();
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

// ---------------------------------------------------------------------------
// Stand epoch — survives unmount/refresh so feeds can tell their resolved
// standing sources predate a confirmed stand. Same-tab only, like the feed
// session snapshot it invalidates.
// ---------------------------------------------------------------------------

const STAND_EPOCH_STORAGE_KEY = 'onsocial.viewer-stand-epoch';

function readStoredStandEpoch(): number {
  try {
    if (typeof sessionStorage === 'undefined') return 0;
    const raw = sessionStorage.getItem(STAND_EPOCH_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

let standEpoch = readStoredStandEpoch();
const standConfirmedListeners = new Set<() => void>();

export function getViewerStandEpoch(): number {
  return standEpoch;
}

export function subscribeViewerStandConfirmed(
  listener: () => void
): () => void {
  standConfirmedListeners.add(listener);
  return () => {
    standConfirmedListeners.delete(listener);
  };
}

/** Call once a stand/unstand confirms on-chain — not on pending or reconcile. */
export function recordViewerStandConfirmed(): void {
  standEpoch += 1;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STAND_EPOCH_STORAGE_KEY, String(standEpoch));
    }
  } catch {
    // Private-mode denial — the in-memory epoch still covers this tab.
  }
  for (const listener of standConfirmedListeners) {
    listener();
  }
}
