import type {
  GroupSponsorDefaultEventRow,
  GroupSponsorQuotaEventRow,
} from '@onsocial/sdk';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import type { ActiveStorageShareGrant } from '@/lib/user-storage-display';

export interface ActiveGroupSponsorDefault {
  enabled: boolean;
  maxBytes: number;
  dailyRefillBytes: number;
}

export interface AppGroupStorageGrantsResponse {
  grants: ActiveStorageShareGrant[];
  defaultQuota: ActiveGroupSponsorDefault | null;
}

function parseEnabledFlag(
  extraData: string | null | undefined,
  fallbackWhenMissing: boolean
): boolean {
  if (!extraData?.trim()) return fallbackWhenMissing;
  try {
    const parsed = JSON.parse(extraData) as { enabled?: unknown };
    if (typeof parsed.enabled === 'boolean') return parsed.enabled;
    if (parsed.enabled === 'true') return true;
    if (parsed.enabled === 'false') return false;
  } catch {
    // Fall through to quota-bytes heuristic.
  }
  return fallbackWhenMissing;
}

function parsePositiveByteField(raw: string | null | undefined): number {
  if (!raw?.trim()) return 0;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function parseNonNegativeNumber(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/** Newest-first quota events → unique candidate target ids (enabled only). */
export function discoverGroupSponsorTargetIds(
  events: GroupSponsorQuotaEventRow[],
  includeTargetIds: string[] = []
): string[] {
  const seen = new Set<string>();
  const targets: string[] = [];

  for (const event of events) {
    const accountId = event.memberId?.trim();
    if (!accountId || seen.has(accountId)) continue;
    seen.add(accountId);

    const maxBytes = parsePositiveByteField(event.quotaBytes);
    const enabled = parseEnabledFlag(event.extraData, maxBytes > 0);
    if (!enabled) continue;
    targets.push(accountId);
  }

  for (const targetId of includeTargetIds) {
    const accountId = targetId.trim();
    if (!accountId || seen.has(accountId)) continue;
    seen.add(accountId);
    targets.push(accountId);
  }

  return targets;
}

export function pickActiveGroupSponsorDefaultFromLive(raw: {
  enabled?: unknown;
  allowance_max_bytes?: unknown;
  daily_refill_bytes?: unknown;
} | null): ActiveGroupSponsorDefault | null {
  if (!raw) return null;
  const enabled = Boolean(raw.enabled);
  const maxBytes = parseNonNegativeNumber(raw.allowance_max_bytes);
  const dailyRefillBytes = parseNonNegativeNumber(raw.daily_refill_bytes);
  if (!enabled) {
    return { enabled: false, maxBytes: 0, dailyRefillBytes: 0 };
  }
  return {
    enabled: true,
    maxBytes,
    dailyRefillBytes,
  };
}

/** Fallback when live views are unavailable (pre-upgrade / indexer-only). */
export function pickActiveGroupSponsorDefault(
  events: GroupSponsorDefaultEventRow[]
): ActiveGroupSponsorDefault | null {
  const latest = events[0];
  if (!latest) return null;

  const maxBytes = parsePositiveByteField(latest.quotaBytes);
  const dailyRefillBytes = parsePositiveByteField(latest.dailyLimit);
  const enabled = parseEnabledFlag(latest.extraData, maxBytes > 0);
  if (!enabled) {
    return { enabled: false, maxBytes: 0, dailyRefillBytes: 0 };
  }

  return {
    enabled: true,
    maxBytes,
    dailyRefillBytes,
  };
}

export function liveQuotaToGrant(
  accountId: string,
  raw: {
    enabled?: unknown;
    is_override?: unknown;
    allowance_max_bytes?: unknown;
    used_bytes?: unknown;
    allowance_bytes?: unknown;
  } | null
): ActiveStorageShareGrant | null {
  if (!raw) return null;
  if (!raw.enabled) return null;
  // Grants list is for explicit overrides; derived defaults stay in Default card.
  if (raw.is_override === false) return null;

  const maxBytes = parseNonNegativeNumber(raw.allowance_max_bytes);
  if (maxBytes <= 0) return null;

  let usedBytes = parseNonNegativeNumber(raw.used_bytes);
  if (
    usedBytes === 0 &&
    raw.allowance_bytes != null &&
    raw.used_bytes == null
  ) {
    const allowance = parseNonNegativeNumber(raw.allowance_bytes);
    usedBytes = Math.max(0, maxBytes - Math.min(maxBytes, allowance));
  }

  return {
    accountId,
    maxBytes,
    usedBytes: Math.min(maxBytes, usedBytes),
  };
}

export async function loadAppGroupStorageGrants(
  groupId: string,
  opts: { includeTargetIds?: string[] } = {}
): Promise<AppGroupStorageGrantsResponse> {
  const os = createServerOnSocialClient();
  const includeTargetIds = opts.includeTargetIds ?? [];

  const [quotaEvents, defaultEvents, liveDefault] = await Promise.all([
    os.query.storage.groupSponsorQuotasGranted(groupId, { limit: 100 }),
    os.query.storage.groupSponsorDefaults(groupId, { limit: 20 }),
    os.storageAccount.groupSponsorDefault(groupId).catch(() => null),
  ]);

  const targetIds = discoverGroupSponsorTargetIds(
    quotaEvents,
    includeTargetIds
  );

  const liveQuotas = await Promise.all(
    targetIds.map(async (accountId) => {
      try {
        const live = await os.storageAccount.groupSponsorQuota(
          groupId,
          accountId
        );
        return { accountId, live };
      } catch {
        return { accountId, live: null };
      }
    })
  );

  const grantsFromLive = liveQuotas
    .map(({ accountId, live }) => liveQuotaToGrant(accountId, live))
    .filter((grant): grant is ActiveStorageShareGrant => grant != null);

  const liveAccountIds = new Set(grantsFromLive.map((grant) => grant.accountId));

  // Optimistic pending targets (just granted; indexer/live may lag).
  const pendingGrants: ActiveStorageShareGrant[] = includeTargetIds
    .filter((accountId) => accountId && !liveAccountIds.has(accountId))
    .map((accountId) => ({
      accountId,
      maxBytes: 0,
      usedBytes: 0,
    }));

  // If every live read failed (pre-upgrade), fall back to indexer max only.
  const liveReadsFailed =
    targetIds.length > 0 &&
    liveQuotas.every((entry) => entry.live == null) &&
    grantsFromLive.length === 0;

  const grants = liveReadsFailed
    ? [
        ...discoverGroupSponsorTargetIds(quotaEvents).map((accountId) => {
          const event = quotaEvents.find(
            (row) => row.memberId?.trim() === accountId
          );
          return {
            accountId,
            maxBytes: parsePositiveByteField(event?.quotaBytes),
            usedBytes: 0,
          };
        }),
        ...pendingGrants,
      ].sort((left, right) => left.accountId.localeCompare(right.accountId))
    : [...grantsFromLive, ...pendingGrants].sort((left, right) =>
        left.accountId.localeCompare(right.accountId)
      );

  const defaultQuota =
    pickActiveGroupSponsorDefaultFromLive(liveDefault) ??
    pickActiveGroupSponsorDefault(defaultEvents);

  return {
    grants,
    defaultQuota,
  };
}
