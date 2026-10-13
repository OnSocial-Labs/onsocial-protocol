// ---------------------------------------------------------------------------
// builders/offers — standing services (`offers/<offerId>`)
// A person and an org keep the same short list. A DAO offers nothing.
// No close date.
// ---------------------------------------------------------------------------

import type { ProfileKind } from '../schema/v1.js';
import { SCHEMA_VERSION } from '../schema/v1.js';
import type { SocialSetData } from './_shared.js';
import { normalizeJobTitle, normalizeJobUrl } from './jobs.js';

export const OFFER_TITLE_MAX = 80;
/** One line under the title. */
export const OFFER_LINE_MAX = 140;
export const OFFER_URL_MAX = 512;
/** Shared ceiling for a person and an org. One read already returns this many. */
export const OFFER_MAX = 8;

export interface OfferBuildInput {
  title: string;
  /** Short line of what you do. Omit when the title is enough. */
  line?: string | null;
  /** Optional booking or site link. */
  url?: string | null;
  since?: number;
  now?: number;
}

export interface OfferRecord {
  offerId: string;
  title: string;
  line: string | null;
  url: string | null;
  since: number | null;
}

export function offerMaxForKind(kind?: ProfileKind | null): number {
  if (kind === 'dao') return 0;
  return OFFER_MAX;
}

/** Quiet face line: `Offers` for one, `Offers · N` after that. */
export function offerLineLabel(count: number): string {
  if (count <= 1) return 'Offers';
  return `Offers · ${count}`;
}

export function offerLineAriaLabel(count: number): string {
  return count <= 1 ? 'View offers' : `View ${count} offers`;
}

export function normalizeOfferTitle(raw: string): string {
  return normalizeJobTitle(raw).slice(0, OFFER_TITLE_MAX);
}

/** Collapse to one line. */
export function normalizeOfferLine(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, OFFER_LINE_MAX);
}

export function normalizeOfferUrl(raw: string): string {
  return normalizeJobUrl(raw.trim().slice(0, OFFER_URL_MAX));
}

export function createOfferId(now = Date.now()): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `o-${now.toString(36)}-${rand}`;
}

export function offerPath(offerId: string): string {
  return `offers/${offerId.trim()}`;
}

export function buildOfferSetData(
  offerId: string,
  input: OfferBuildInput
): SocialSetData {
  const title = normalizeOfferTitle(input.title);
  if (!title) {
    throw new Error('Offer title is required');
  }
  const line = normalizeOfferLine(input.line ?? '');
  const url = normalizeOfferUrl(input.url ?? '');
  const since = input.since ?? input.now ?? Date.now();
  return {
    [offerPath(offerId)]: {
      v: SCHEMA_VERSION,
      title,
      ...(line ? { line } : {}),
      ...(url ? { url } : {}),
      since,
    },
  };
}

export function buildOfferRemoveData(offerId: string): SocialSetData {
  return { [offerPath(offerId)]: null };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      return asRecord(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }
  return null;
}

function offerIdFromKey(key: string): string {
  const parts = key.split('/').filter(Boolean);
  const offersAt = parts.lastIndexOf('offers');
  const id = offersAt >= 0 ? parts[offersAt + 1] : parts[parts.length - 1];
  return id?.trim() ?? '';
}

export function parseOfferKeyEntry(entry: {
  key: string;
  value?: unknown;
}): OfferRecord | null {
  const offerId = offerIdFromKey(entry.key);
  if (!offerId || offerId === 'offers') return null;
  const value = asRecord(entry.value);
  if (!value) return null;
  const title = normalizeOfferTitle(
    typeof value.title === 'string' ? value.title : ''
  );
  if (!title) return null;
  const line = normalizeOfferLine(
    typeof value.line === 'string' ? value.line : ''
  );
  const url = normalizeOfferUrl(typeof value.url === 'string' ? value.url : '');
  const sinceRaw = value.since;
  const since =
    typeof sinceRaw === 'number'
      ? sinceRaw
      : typeof sinceRaw === 'string' && sinceRaw.trim()
        ? Number(sinceRaw)
        : null;
  return {
    offerId,
    title,
    line: line || null,
    url: url || null,
    since: since != null && Number.isFinite(since) ? since : null,
  };
}

/** Oldest first so the face order stays put. */
export function sortOffers(offers: OfferRecord[]): OfferRecord[] {
  return [...offers].sort((a, b) => {
    const as = a.since ?? 0;
    const bs = b.since ?? 0;
    if (as !== bs) return as - bs;
    return a.offerId.localeCompare(b.offerId);
  });
}
