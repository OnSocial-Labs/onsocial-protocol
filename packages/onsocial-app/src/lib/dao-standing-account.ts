/**
 * Classify standing targets as people vs DAO orgs.
 * Prefer server `isDao` when present; fall back to local heuristics.
 */

import { readRecentCommunityDaos } from '@/features/protocol/dao-accounts';
import { isHeuristicDaoAccountId } from '@/lib/enrich-standing-with-dao';

export type StandingEntityFilter = 'people' | 'daos';

const DAO_STANDING_TARGETS_KEY = 'onsocial.standing.dao-targets';
const DAO_STANDING_TARGETS_LIMIT = 200;

function normalizeAccountId(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function readDaoStandingTargets(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DAO_STANDING_TARGETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeAccountId(String(entry ?? '')))
      .filter(Boolean)
      .slice(0, DAO_STANDING_TARGETS_LIMIT);
  } catch {
    return [];
  }
}

/** Remember a DAO account so optimistic / unindexed rows stay in the DAOs filter. */
export function rememberDaoStandingTarget(
  accountId: string | null | undefined
): string[] {
  const id = normalizeAccountId(accountId);
  if (!id || typeof window === 'undefined') return readDaoStandingTargets();
  const next = [
    id,
    ...readDaoStandingTargets().filter((entry) => entry !== id),
  ].slice(0, DAO_STANDING_TARGETS_LIMIT);
  try {
    window.localStorage.setItem(
      DAO_STANDING_TARGETS_KEY,
      JSON.stringify(next)
    );
  } catch {
    // ignore quota / private mode
  }
  return next;
}

/**
 * True when this account should be treated as a DAO org in standing lists.
 * Prefer server `isDao === true`; keep local memory/heuristics for unindexed DAOs.
 */
export function isDaoStandingTarget(
  accountId: string | null | undefined,
  serverIsDao?: boolean | null
): boolean {
  if (serverIsDao === true) return true;

  const id = normalizeAccountId(accountId);
  if (!id) return false;
  if (isHeuristicDaoAccountId(id)) return true;
  if (readDaoStandingTargets().includes(id)) return true;
  if (readRecentCommunityDaos().includes(id)) return true;
  return false;
}

export function matchesStandingEntityFilter(
  account: { accountId: string; isDao?: boolean },
  filter: StandingEntityFilter
): boolean {
  const isDao = isDaoStandingTarget(account.accountId, account.isDao);
  return filter === 'daos' ? isDao : !isDao;
}
