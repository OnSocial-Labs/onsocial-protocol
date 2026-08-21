/**
 * Ticket / event drop metadata — event window + place slug in `extra`.
 * Sale window stays on collection start_time/end_time (separate).
 */

import { normalizePlaceSlug, placeLabel } from '@/lib/post-place';

export type TicketEventMeta = {
  eventStartsAtMs: number | null;
  eventEndsAtMs: number | null;
  place: string | null;
};

function asPositiveMs(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }
  return null;
}

/** Read event window + place from collection/token `metadata.extra`. */
export function parseTicketEventFromExtra(
  extra: Record<string, unknown> | null | undefined
): TicketEventMeta {
  if (!extra) {
    return { eventStartsAtMs: null, eventEndsAtMs: null, place: null };
  }
  return {
    eventStartsAtMs: asPositiveMs(extra.eventStartsAt),
    eventEndsAtMs: asPositiveMs(extra.eventEndsAt),
    place: normalizePlaceSlug(extra.place),
  };
}

/** Fields to merge into create-drop `extra` (omit empties). */
export function ticketEventExtraFields(input: {
  eventStartsAtMs?: number | null;
  eventEndsAtMs?: number | null;
  place?: string | null;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (
    input.eventStartsAtMs != null &&
    Number.isFinite(input.eventStartsAtMs) &&
    input.eventStartsAtMs > 0
  ) {
    out.eventStartsAt = Math.floor(input.eventStartsAtMs);
  }
  if (
    input.eventEndsAtMs != null &&
    Number.isFinite(input.eventEndsAtMs) &&
    input.eventEndsAtMs > 0
  ) {
    out.eventEndsAt = Math.floor(input.eventEndsAtMs);
  }
  const place = normalizePlaceSlug(input.place ?? null);
  if (place) out.place = place;
  return out;
}

export function ticketEventPlaceLabel(
  place: string | null | undefined
): string | null {
  return placeLabel(place);
}

/**
 * Rain-day override on collection freeform `metadata` (not the mint template).
 * Prefer this over `extra.eventEndsAt` when present so Facts/Door stay in sync
 * after organiser postpone without rewriting metadata_template.
 */
export function parseTicketEventFromCollectionMetadata(
  metadataJson: string | null | undefined
): Partial<TicketEventMeta> {
  if (!metadataJson?.trim()) return {};
  try {
    const meta = JSON.parse(metadataJson) as Record<string, unknown>;
    if (!meta || typeof meta !== 'object') return {};
    const eventStartsAtMs = asPositiveMs(meta.eventStartsAt);
    const eventEndsAtMs = asPositiveMs(meta.eventEndsAt);
    const place = normalizePlaceSlug(meta.place);
    return {
      ...(eventStartsAtMs != null ? { eventStartsAtMs } : {}),
      ...(eventEndsAtMs != null ? { eventEndsAtMs } : {}),
      ...(place ? { place } : {}),
    };
  } catch {
    return {};
  }
}

/** Merge event end into collection freeform metadata (preserves series/cover). */
export function mergeEventEndsIntoCollectionMetadata(
  existingJson: string | null | undefined,
  eventEndsAtMs: number
): string {
  let meta: Record<string, unknown> = {};
  if (existingJson?.trim()) {
    try {
      const parsed = JSON.parse(existingJson) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        meta = { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      meta = {};
    }
  }
  meta.eventEndsAt = Math.floor(eventEndsAtMs);
  return JSON.stringify(meta);
}
