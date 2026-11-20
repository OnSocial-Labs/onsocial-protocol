/**
 * Synchronous guard for "Earlier" pagination.
 * The button can fire twice before React re-renders `loadingOlder`, so the
 * in-flight flag lives on a ref and flips before the first await.
 */
export function claimOlderMessagesLoad(inflight: {
  current: boolean;
}): boolean {
  if (inflight.current) return false;
  inflight.current = true;
  return true;
}

export function releaseOlderMessagesLoad(inflight: { current: boolean }): void {
  inflight.current = false;
}
