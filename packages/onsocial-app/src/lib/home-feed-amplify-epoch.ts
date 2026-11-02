/**
 * Amplify epoch — same-tab signal that Hot ranking may have changed since the
 * feed session snapshot was written. Leave/return soft-refetches Hot instead of
 * keeping a pre-boost order; the viewport stays put until the reader jumps.
 */

const AMPLIFY_EPOCH_STORAGE_KEY = 'onsocial.viewer-amplify-epoch';

export type ViewerAmplifyConfirmedDetail = {
  authorId: string | null;
};

function readStoredAmplifyEpoch(): number {
  try {
    if (typeof sessionStorage === 'undefined') return 0;
    const raw = sessionStorage.getItem(AMPLIFY_EPOCH_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

let amplifyEpoch = readStoredAmplifyEpoch();
let lastAmplifyAuthorId: string | null = null;
const amplifyConfirmedListeners = new Set<
  (detail: ViewerAmplifyConfirmedDetail) => void
>();

export function getViewerAmplifyEpoch(): number {
  return amplifyEpoch;
}

/** Author of the most recently confirmed amplify — for the Hot catch-up face. */
export function getLastAmplifyAuthorId(): string | null {
  return lastAmplifyAuthorId;
}

export function subscribeViewerAmplifyConfirmed(
  listener: (detail: ViewerAmplifyConfirmedDetail) => void
): () => void {
  amplifyConfirmedListeners.add(listener);
  return () => {
    amplifyConfirmedListeners.delete(listener);
  };
}

/** Call once an amplify confirms on-chain — not on pending. */
export function recordViewerAmplifyConfirmed(authorId?: string): void {
  if (authorId?.trim()) {
    lastAmplifyAuthorId = authorId.trim();
  }
  amplifyEpoch += 1;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(AMPLIFY_EPOCH_STORAGE_KEY, String(amplifyEpoch));
    }
  } catch {
    // Private-mode denial — the in-memory epoch still covers this tab.
  }
  const detail: ViewerAmplifyConfirmedDetail = {
    authorId: lastAmplifyAuthorId,
  };
  for (const listener of amplifyConfirmedListeners) {
    listener(detail);
  }
}
