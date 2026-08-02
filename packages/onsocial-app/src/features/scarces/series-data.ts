import { resolveProfileMediaUrl } from '@/lib/profile-display';

/**
 * Series branding — creator-owned identity for an ongoing drop series.
 *
 * Collections only carry a lightweight `series: { id, title }` pointer in
 * their metadata; the brand itself (logo, description) lives once under the
 * creator's own social data at `series/<seriesId>`, so one write updates
 * every surface and only the series creator can change it.
 */

export interface SeriesBranding {
  creatorId: string;
  seriesId: string;
  title: string | null;
  description: string | null;
  /** Raw stored logo ref (`ipfs://…`), kept for round-tripping edits. */
  logo: string | null;
  /** Resolved https URL for rendering, or null when unset. */
  logoUrl: string | null;
}

/** Social-data key under the creator's account. */
export function seriesDataPath(seriesId: string): string {
  return `series/${seriesId}`;
}

/** Value written to `series/<seriesId>` (auto-JSON-stringified by the SDK). */
export function buildSeriesBrandingPayload(opts: {
  title: string;
  description?: string;
  logo?: string | null;
}): Record<string, unknown> {
  return {
    v: 1,
    title: opts.title,
    ...(opts.description?.trim()
      ? { description: opts.description.trim() }
      : {}),
    ...(opts.logo ? { logo: opts.logo } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseBranding(
  creatorId: string,
  seriesId: string,
  raw: unknown
): SeriesBranding | null {
  const record =
    typeof raw === 'string' ? asRecord(safeJsonParse(raw)) : asRecord(raw);
  if (!record) return null;
  const title =
    typeof record.title === 'string' && record.title.trim()
      ? record.title.trim()
      : null;
  const description =
    typeof record.description === 'string' && record.description.trim()
      ? record.description.trim()
      : null;
  const logo =
    typeof record.logo === 'string' && record.logo.trim()
      ? record.logo.trim()
      : null;
  return {
    creatorId,
    seriesId,
    title,
    description,
    logo,
    logoUrl: resolveProfileMediaUrl(logo),
  };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Branding for one series, or null when the creator never set any. */
export async function fetchSeriesBranding(
  creatorId: string,
  seriesId: string
): Promise<SeriesBranding | null> {
  const creator = creatorId.trim();
  const id = seriesId.trim();
  if (!creator || !id) return null;
  try {
    const { createReadOnlyOnSocialClient } = await import(
      '@/lib/create-readonly-onsocial-client'
    );
    const client = createReadOnlyOnSocialClient();
    const entry = await client.social.getOne(seriesDataPath(id), creator);
    if (!entry || entry.deleted || entry.value == null) return null;
    return parseBranding(creator, id, entry.value);
  } catch {
    return null;
  }
}

// Per-session cache so catalog series headings don't refetch on re-render.
const brandingCache = new Map<string, Promise<SeriesBranding | null>>();

/** Cached read for list surfaces (hub catalog headings). */
export function fetchSeriesBrandingCached(
  creatorId: string,
  seriesId: string
): Promise<SeriesBranding | null> {
  const key = `${creatorId}:${seriesId}`;
  let pending = brandingCache.get(key);
  if (!pending) {
    pending = fetchSeriesBranding(creatorId, seriesId);
    brandingCache.set(key, pending);
  }
  return pending;
}

/** Drop the cached entry after the creator saves new branding. */
export function invalidateSeriesBrandingCache(
  creatorId: string,
  seriesId: string
): void {
  brandingCache.delete(`${creatorId}:${seriesId}`);
}
