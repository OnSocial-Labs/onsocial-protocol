import { formatDaoRoleLabel } from '@/lib/page-drawer-meta';

export type DaoRolesClientPayload = {
  accountId: string;
  daoRoleIds: string[];
  daoRoleLabels: string[];
};

const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  at: number;
  value: DaoRolesClientPayload;
  inflight?: Promise<DaoRolesClientPayload>;
};

const cache = new Map<string, CacheEntry>();

function normalizeAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

function emptyPayload(accountId: string): DaoRolesClientPayload {
  return { accountId, daoRoleIds: [], daoRoleLabels: [] };
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

/**
 * Soft-fill DAO roles for face mark + Joined facts.
 * Dedupes in-flight requests and caches briefly so face + Joined share one hit.
 */
export async function fetchDaoRolesClient(
  accountId: string,
  signal?: AbortSignal
): Promise<DaoRolesClientPayload> {
  const key = normalizeAccountId(accountId);
  if (!key) return emptyPayload(accountId);

  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS && !hit.inflight) {
    return hit.value;
  }
  if (hit?.inflight) {
    return hit.inflight;
  }

  const inflight = (async (): Promise<DaoRolesClientPayload> => {
    const res = await fetch(
      `/api/profile/dao-roles?accountId=${encodeURIComponent(accountId)}`,
      { signal, cache: 'no-store' }
    );
    if (!res.ok) return emptyPayload(accountId);
    const body = (await res.json().catch(() => null)) as {
      daoRoleIds?: string[];
      daoRoleLabels?: string[];
    } | null;

    const daoRoleIds = Array.isArray(body?.daoRoleIds)
      ? body.daoRoleIds.filter((id): id is string => typeof id === 'string')
      : [];
    const daoRoleLabels = Array.isArray(body?.daoRoleLabels)
      ? body.daoRoleLabels.filter(
          (label): label is string => typeof label === 'string'
        )
      : daoRoleIds.map(formatDaoRoleLabel).filter(Boolean);

    return {
      accountId,
      daoRoleIds,
      daoRoleLabels,
    };
  })();

  cache.set(key, {
    at: now,
    value: hit?.value ?? emptyPayload(accountId),
    inflight,
  });

  try {
    const value = await inflight;
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (error) {
    cache.delete(key);
    if (isAbortError(error)) throw error;
    return emptyPayload(accountId);
  }
}
