import { formatDaoRoleLabel } from '@/lib/page-drawer-meta';
import type {
  ProtocolDaoCouncilRole,
  ProtocolDaoMemberships,
  ProtocolDaoProposerFlags,
} from '@/lib/protocol-dao-memberships';
import {
  EMPTY_PROTOCOL_DAO_MEMBERSHIPS,
  EMPTY_PROTOCOL_DAO_PROPOSER_FLAGS,
} from '@/lib/protocol-dao-memberships';

export type DaoRolesClientPayload = {
  accountId: string;
  daoRoleIds: string[];
  daoRoleLabels: string[];
  memberships: ProtocolDaoMemberships;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_VERSION = 'v3';

type CacheEntry = {
  at: number;
  value: DaoRolesClientPayload;
  inflight?: Promise<DaoRolesClientPayload>;
};

const cache = new Map<string, CacheEntry>();

function normalizeAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

function cacheKey(accountId: string): string {
  return `${CACHE_VERSION}:${normalizeAccountId(accountId)}`;
}

function emptyPayload(accountId: string): DaoRolesClientPayload {
  return {
    accountId,
    daoRoleIds: [],
    daoRoleLabels: [],
    memberships: { ...EMPTY_PROTOCOL_DAO_MEMBERSHIPS },
  };
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function parseProposerFlags(value: unknown): ProtocolDaoProposerFlags {
  if (!value || typeof value !== 'object') {
    return EMPTY_PROTOCOL_DAO_PROPOSER_FLAGS;
  }
  const record = value as Record<string, unknown>;
  return {
    governance: record.governance === true,
    treasury: record.treasury === true,
  };
}

function parseCouncilRole(
  value: unknown
): ProtocolDaoCouncilRole | null {
  return value === 'guardians' || value === 'council' ? value : null;
}

/**
 * Resolve shared inflight without aborting the network request when one
 * consumer unmounts (Strict Mode / virtualized lists). Consumer `signal`
 * only cancels that waiter’s interest.
 */
function raceWithAbort<T>(
  promise: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

/**
 * Soft-fill DAO roles for face mark + Joined facts.
 * Dedupes in-flight requests and caches briefly so face + Joined share one hit.
 */
export async function fetchDaoRolesClient(
  accountId: string,
  signal?: AbortSignal
): Promise<DaoRolesClientPayload> {
  const key = cacheKey(accountId);
  if (!normalizeAccountId(accountId)) return emptyPayload(accountId);
  if (signal?.aborted) throw abortError();

  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS && !hit.inflight) {
    return hit.value;
  }

  let inflight = hit?.inflight;
  if (!inflight) {
    inflight = (async (): Promise<DaoRolesClientPayload> => {
      try {
        // Shared request — never bind a single consumer’s AbortSignal here.
        const res = await fetch(
          `/api/profile/dao-roles?accountId=${encodeURIComponent(accountId)}`,
          { cache: 'no-store' }
        );
        if (!res.ok) return emptyPayload(accountId);
        const body = (await res.json().catch(() => null)) as {
          daoRoleIds?: string[];
          daoRoleLabels?: string[];
          memberships?: {
            governance?: unknown;
            treasury?: unknown;
            proposer?: unknown;
          };
        } | null;

        const daoRoleIds = Array.isArray(body?.daoRoleIds)
          ? body.daoRoleIds.filter((id): id is string => typeof id === 'string')
          : [];
        const daoRoleLabels = Array.isArray(body?.daoRoleLabels)
          ? body.daoRoleLabels.filter(
              (label): label is string => typeof label === 'string'
            )
          : daoRoleIds.map(formatDaoRoleLabel).filter(Boolean);

        const value: DaoRolesClientPayload = {
          accountId,
          daoRoleIds,
          daoRoleLabels,
          memberships: {
            governance: parseCouncilRole(body?.memberships?.governance),
            treasury: parseCouncilRole(body?.memberships?.treasury),
            proposer: parseProposerFlags(body?.memberships?.proposer),
          },
        };
        cache.set(key, { at: Date.now(), value });
        return value;
      } catch (error) {
        cache.delete(key);
        throw error;
      }
    })();

    cache.set(key, {
      at: now,
      value: hit?.value ?? emptyPayload(accountId),
      inflight,
    });
  }

  try {
    return await raceWithAbort(inflight, signal);
  } catch (error) {
    // Consumer abort must not clear the shared entry or invent empty roles.
    if (isAbortError(error)) throw error;
    return emptyPayload(accountId);
  }
}
