import type { AppEndorsementSupporter } from '@/lib/app-endorsement-supporters';

/**
 * Shared in-flight/cache for one vouch's supporters. The focus-sheet facepile
 * warms it; the supporters sheet reads the same promise on open. Write flows
 * (support tx) must invalidate so the next read refetches.
 */
const supportersCache = new Map<string, Promise<AppEndorsementSupporter[]>>();

export function fetchEndorsementSupporters(
  endorsementId: string
): Promise<AppEndorsementSupporter[]> {
  const cached = supportersCache.get(endorsementId);
  if (cached) return cached;

  const params = new URLSearchParams({ endorsementId });
  const request = fetch(`/api/endorsement/supporters?${params}`, {
    cache: 'no-store',
  })
    .then(async (response) => {
      const body = (await response.json().catch(() => null)) as {
        supporters?: AppEndorsementSupporter[];
        error?: string;
        detail?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          body?.detail ?? body?.error ?? 'Could not load supporters.'
        );
      }
      return body?.supporters ?? [];
    })
    .catch((error: unknown) => {
      // Never cache a failure — the next read retries.
      supportersCache.delete(endorsementId);
      throw error;
    });

  supportersCache.set(endorsementId, request);
  return request;
}

export function invalidateEndorsementSupporters(endorsementId: string): void {
  supportersCache.delete(endorsementId);
}
