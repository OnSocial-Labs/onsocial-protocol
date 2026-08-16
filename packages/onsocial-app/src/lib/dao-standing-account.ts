/**
 * Classify standing targets as people vs DAO orgs.
 * Used to keep DAO stands out of the default People standing list.
 */

import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/app-config';
import { readRecentCommunityDaos } from '@/features/protocol/dao-accounts';

export type StandingEntityFilter = 'people' | 'daos';

const DAO_STANDING_TARGETS_KEY = 'onsocial.standing.dao-targets';
const DAO_STANDING_TARGETS_LIMIT = 200;

const SPUTNIK_DAO_SUFFIXES = [
  '.sputnik-dao.near',
  '.sputnik-dao.testnet',
] as const;

function normalizeAccountId(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function isProtocolPortfolioDao(accountId: string): boolean {
  return (
    accountId === GOVERNANCE_DAO_ACCOUNT.trim().toLowerCase() ||
    accountId === TREASURY_DAO_ACCOUNT.trim().toLowerCase()
  );
}

function hasSputnikDaoSuffix(accountId: string): boolean {
  return SPUTNIK_DAO_SUFFIXES.some((suffix) => accountId.endsWith(suffix));
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

/** Remember a DAO account so standing lists can route it to the DAOs filter. */
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
 * Conservative: unknown accounts stay in People.
 */
export function isDaoStandingTarget(
  accountId: string | null | undefined
): boolean {
  const id = normalizeAccountId(accountId);
  if (!id) return false;
  if (isProtocolPortfolioDao(id)) return true;
  if (hasSputnikDaoSuffix(id)) return true;
  if (readDaoStandingTargets().includes(id)) return true;
  if (readRecentCommunityDaos().includes(id)) return true;
  return false;
}

export function matchesStandingEntityFilter(
  accountId: string,
  filter: StandingEntityFilter
): boolean {
  const isDao = isDaoStandingTarget(accountId);
  return filter === 'daos' ? isDao : !isDao;
}
