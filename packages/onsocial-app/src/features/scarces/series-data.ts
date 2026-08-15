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
  const map = await fetchSeriesBrandingBatch(creator, [id]);
  return map.get(id) ?? null;
}

/**
 * One `social.get` per creator for many series ids — avoids N× getOne on
 * hub catalog headings.
 */
export async function fetchSeriesBrandingBatch(
  creatorId: string,
  seriesIds: string[]
): Promise<Map<string, SeriesBranding | null>> {
  const creator = creatorId.trim();
  const ids = Array.from(
    new Set(seriesIds.map((id) => id.trim()).filter(Boolean))
  );
  const out = new Map<string, SeriesBranding | null>();
  if (!creator || ids.length === 0) return out;

  try {
    const { createReadOnlyOnSocialClient } = await import(
      '@/lib/create-readonly-onsocial-client'
    );
    const client = createReadOnlyOnSocialClient();
    const keys = ids.map((id) => seriesDataPath(id));
    const entries = await client.social.get(keys, creator);
    const byKey = new Map<string, (typeof entries)[number]>();
    for (const entry of entries) {
      const requested = entry.requested_key?.trim();
      const full = entry.full_key?.trim();
      if (requested) byKey.set(requested, entry);
      if (full) byKey.set(full, entry);
    }
    for (const id of ids) {
      const path = seriesDataPath(id);
      const entry = byKey.get(path);
      if (!entry || entry.deleted || entry.value == null) {
        out.set(id, null);
        continue;
      }
      out.set(id, parseBranding(creator, id, entry.value));
    }
  } catch {
    for (const id of ids) out.set(id, null);
  }
  return out;
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

/**
 * Prefetch brands for catalog groups — one get() per creator, fills the
 * session cache so section headings resolve without N× getOne.
 */
export function prefetchSeriesBrandingForGroups(
  groups: ReadonlyArray<{ creatorId: string; seriesId: string | null }>
): Promise<void> {
  const byCreator = new Map<string, string[]>();
  for (const group of groups) {
    const creator = group.creatorId.trim();
    const seriesId = group.seriesId?.trim();
    if (!creator || !seriesId) continue;
    const key = `${creator}:${seriesId}`;
    if (brandingCache.has(key)) continue;
    const list = byCreator.get(creator) ?? [];
    list.push(seriesId);
    byCreator.set(creator, list);
  }

  return Promise.all(
    [...byCreator.entries()].map(async ([creator, seriesIds]) => {
      const unique = [...new Set(seriesIds)];
      // Reserve cache slots so headings don't race a second getOne.
      const resolvers = new Map<
        string,
        (value: SeriesBranding | null) => void
      >();
      for (const id of unique) {
        const key = `${creator}:${id}`;
        if (brandingCache.has(key)) continue;
        brandingCache.set(
          key,
          new Promise<SeriesBranding | null>((resolve) => {
            resolvers.set(id, resolve);
          })
        );
      }
      if (resolvers.size === 0) return;
      const map = await fetchSeriesBrandingBatch(creator, [...resolvers.keys()]);
      for (const [id, resolve] of resolvers) {
        resolve(map.get(id) ?? null);
      }
    })
  ).then(() => undefined);
}

/** Drop the cached entry after the creator saves new branding. */
export function invalidateSeriesBrandingCache(
  creatorId: string,
  seriesId: string
): void {
  brandingCache.delete(`${creatorId}:${seriesId}`);
}

/**
 * SSR branding via the server gateway client. Falls back to null when the
 * API key is missing or the creator never set a brand (client soft-fills).
 */
export async function fetchSeriesBrandingServer(
  creatorId: string,
  seriesId: string
): Promise<SeriesBranding | null> {
  const creator = creatorId.trim();
  const id = seriesId.trim();
  if (!creator || !id) return null;
  try {
    const { createServerOnSocialClient } = await import(
      '@/lib/create-server-onsocial-client'
    );
    const client = createServerOnSocialClient();
    const entry = await client.social.getOne(seriesDataPath(id), creator);
    if (!entry || entry.deleted || entry.value == null) return null;
    return parseBranding(creator, id, entry.value);
  } catch {
    return null;
  }
}
