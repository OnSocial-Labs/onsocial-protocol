import type {
  GroupSponsorDefaultEventRow,
  GroupSponsorQuotaEventRow,
  GroupSponsorSpendEventRow,
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

function parseNonNegativeByteField(
  raw: string | null | undefined
): number | null {
  if (!raw?.trim()) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

/** Latest remaining allowance per payer from newest-first spend events. */
export function latestRemainingByPayer(
  spends: GroupSponsorSpendEventRow[]
): Map<string, number> {
  const remainingByPayer = new Map<string, number>();

  for (const spend of spends) {
    const payer = spend.payer?.trim();
    if (!payer || remainingByPayer.has(payer)) continue;
    const remaining = parseNonNegativeByteField(spend.remainingAllowance);
    if (remaining == null) continue;
    remainingByPayer.set(payer, remaining);
  }

  return remainingByPayer;
}

export function pickActiveGroupSponsorGrants(
  events: GroupSponsorQuotaEventRow[],
  includeTargetIds: string[] = [],
  spends: GroupSponsorSpendEventRow[] = []
): ActiveStorageShareGrant[] {
  const seen = new Set<string>();
  const grants: ActiveStorageShareGrant[] = [];
  const remainingByPayer = latestRemainingByPayer(spends);

  for (const event of events) {
    const accountId = event.memberId?.trim();
    if (!accountId || seen.has(accountId)) continue;
    seen.add(accountId);

    const maxBytes = parsePositiveByteField(event.quotaBytes);
    const enabled = parseEnabledFlag(event.extraData, maxBytes > 0);
    if (!enabled || maxBytes <= 0) continue;

    const remaining = remainingByPayer.get(accountId);
    const usedBytes =
      remaining == null
        ? 0
        : Math.max(0, Math.min(maxBytes, maxBytes - remaining));

    grants.push({
      accountId,
      maxBytes,
      usedBytes,
    });
  }

  for (const targetId of includeTargetIds) {
    const accountId = targetId.trim();
    if (!accountId || seen.has(accountId)) continue;
    seen.add(accountId);
    grants.push({
      accountId,
      maxBytes: 0,
      usedBytes: 0,
    });
  }

  return grants.sort((left, right) =>
    left.accountId.localeCompare(right.accountId)
  );
}

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

export async function loadAppGroupStorageGrants(
  groupId: string,
  opts: { includeTargetIds?: string[] } = {}
): Promise<AppGroupStorageGrantsResponse> {
  const os = createServerOnSocialClient();
  const [quotaEvents, defaultEvents, spendEvents] = await Promise.all([
    os.query.storage.groupSponsorQuotasGranted(groupId, { limit: 100 }),
    os.query.storage.groupSponsorDefaults(groupId, { limit: 20 }),
    os.query.storage.groupSponsorSpends(groupId, { limit: 200 }),
  ]);

  return {
    grants: pickActiveGroupSponsorGrants(
      quotaEvents,
      opts.includeTargetIds ?? [],
      spendEvents
    ),
    defaultQuota: pickActiveGroupSponsorDefault(defaultEvents),
  };
}
