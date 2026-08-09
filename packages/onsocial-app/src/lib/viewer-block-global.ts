import type { ViewerBlockLedger } from '@/lib/viewer-block-ledger';

const globalOutgoingLedger: ViewerBlockLedger = new Map();
const globalPendingTargets = new Set<string>();
const globalApiOutgoing = new Set<string>();
const globalApiIncoming = new Set<string>();
let globalLedgerVersion = 0;
const listeners = new Set<() => void>();

export function getGlobalViewerBlockLedger(): ViewerBlockLedger {
  return globalOutgoingLedger;
}

export function getGlobalViewerBlockLedgerVersion(): number {
  return globalLedgerVersion;
}

export function getGlobalApiOutgoingBlockIds(): string[] {
  return Array.from(globalApiOutgoing);
}

export function getGlobalApiIncomingBlockIds(): string[] {
  return Array.from(globalApiIncoming);
}

export function setGlobalApiBlockIds(input: {
  outgoing: readonly string[];
  incoming: readonly string[];
}): void {
  globalApiOutgoing.clear();
  globalApiIncoming.clear();
  for (const id of input.outgoing) {
    globalApiOutgoing.add(id.toLowerCase());
  }
  for (const id of input.incoming) {
    globalApiIncoming.add(id.toLowerCase());
  }
  bumpGlobalViewerBlockLedger();
}

export function isGlobalBlockPending(targetAccountId: string): boolean {
  return globalPendingTargets.has(targetAccountId);
}

export function setGlobalBlockPending(
  targetAccountId: string,
  pending: boolean
): void {
  if (pending) globalPendingTargets.add(targetAccountId);
  else globalPendingTargets.delete(targetAccountId);
  bumpGlobalViewerBlockLedger();
}

export function bumpGlobalViewerBlockLedger(): void {
  globalLedgerVersion += 1;
  for (const listener of listeners) listener();
}

export function subscribeGlobalViewerBlockLedger(
  listener: () => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearGlobalViewerBlockState(): void {
  globalOutgoingLedger.clear();
  globalPendingTargets.clear();
  globalApiOutgoing.clear();
  globalApiIncoming.clear();
  bumpGlobalViewerBlockLedger();
}
