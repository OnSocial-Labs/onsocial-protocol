import type { OfferRecord } from '@onsocial/sdk';

export const OFFERS_CHANGED_EVENT = 'onsocial:offers-changed';

export function notifyOffersChanged(accountId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(OFFERS_CHANGED_EVENT, { detail: { accountId } })
  );
}

export async function fetchAccountOffers(
  accountId: string,
  signal?: AbortSignal
): Promise<OfferRecord[]> {
  const params = new URLSearchParams({ accountId });
  const response = await fetch(`/api/offers?${params.toString()}`, {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) return [];
  const body = (await response.json().catch(() => null)) as {
    offers?: OfferRecord[];
  } | null;
  return Array.isArray(body?.offers) ? body.offers : [];
}

export async function fetchOfferTitles(
  accountIds: string[],
  signal?: AbortSignal
): Promise<Record<string, string>> {
  const ids = accountIds
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 40);
  if (ids.length === 0) return {};
  const params = new URLSearchParams({ accountIds: ids.join(',') });
  const response = await fetch(`/api/offers?${params.toString()}`, {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) return {};
  const body = (await response.json().catch(() => null)) as {
    titles?: Record<string, string>;
  } | null;
  return body?.titles && typeof body.titles === 'object' ? body.titles : {};
}
