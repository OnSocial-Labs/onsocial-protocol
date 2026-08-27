import { config } from '../config/index.js';
import { listCommunityAppCatalog } from '../services/developer-apps/index.js';
import { listedOriginsFromApps } from '../services/app-handoff.js';

const CATALOG_TTL_MS = 30_000;

let catalogCache: { at: number; origins: Set<string> } | null = null;

async function listedCommunityOrigins(): Promise<Set<string>> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.origins;
  }
  const origins = listedOriginsFromApps(await listCommunityAppCatalog());
  catalogCache = { at: Date.now(), origins };
  return origins;
}

export function createCorsOriginResolver(): (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) => void {
  const configured =
    config.corsOrigins === '*'
      ? null
      : new Set(
          config.corsOrigins
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        );

  return (origin, callback) => {
    void (async () => {
      try {
        if (!origin || !configured) {
          callback(null, true);
          return;
        }
        if (configured.has(origin)) {
          callback(null, true);
          return;
        }
        const listed = await listedCommunityOrigins();
        callback(null, listed.has(origin));
      } catch {
        callback(null, false);
      }
    })();
  };
}
