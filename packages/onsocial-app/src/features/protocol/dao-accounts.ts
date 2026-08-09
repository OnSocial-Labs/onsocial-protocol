import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/app-config';
import type { ProtocolDaoBoard } from '@/lib/app-routes';

const DAO_ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const RECENT_COMMUNITY_DAOS_KEY = 'onsocial.protocol.recent-daos';
const RECENT_COMMUNITY_DAOS_LIMIT = 8;

export const PROTOCOL_DAO_BOARD_OPTIONS: Array<{
  value: ProtocolDaoBoard;
  label: string;
}> = [
  { value: 'governance', label: 'Governance' },
  { value: 'treasury', label: 'Treasury' },
  { value: 'community', label: 'Community' },
];

export const PROTOCOL_COMMUNITY_DAO_SEED: Array<{
  accountId: string;
  label: string;
  description: string;
}> = [
  {
    accountId: GOVERNANCE_DAO_ACCOUNT,
    label: 'OnSocial Governance',
    description: 'Protocol policy and upgrades',
  },
  {
    accountId: TREASURY_DAO_ACCOUNT,
    label: 'OnSocial Treasury',
    description: 'Protocol treasury decisions',
  },
];

export function isValidProtocolDaoAccountId(
  value: string | null | undefined
): boolean {
  const id = value?.trim().toLowerCase() ?? '';
  return DAO_ACCOUNT_PATTERN.test(id);
}

export function normalizeProtocolDaoAccountId(
  value: string | null | undefined
): string | null {
  const id = value?.trim().toLowerCase() ?? '';
  return DAO_ACCOUNT_PATTERN.test(id) ? id : null;
}

export function resolveProtocolDaoAccountId(
  board: ProtocolDaoBoard = 'governance',
  communityAccount?: string | null
): string | null {
  if (board === 'treasury') return TREASURY_DAO_ACCOUNT;
  if (board === 'governance') return GOVERNANCE_DAO_ACCOUNT;
  return normalizeProtocolDaoAccountId(communityAccount);
}

export function resolveProtocolDaoBoard(
  daoAccountId: string | null | undefined
): ProtocolDaoBoard {
  if (daoAccountId === TREASURY_DAO_ACCOUNT) return 'treasury';
  if (daoAccountId === GOVERNANCE_DAO_ACCOUNT) return 'governance';
  return 'community';
}

export function resolveKnownBoardForDaoAccount(
  daoAccountId: string | null | undefined
): ProtocolDaoBoard | null {
  if (daoAccountId === TREASURY_DAO_ACCOUNT) return 'treasury';
  if (daoAccountId === GOVERNANCE_DAO_ACCOUNT) return 'governance';
  return null;
}

export function readRecentCommunityDaos(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_COMMUNITY_DAOS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeProtocolDaoAccountId(String(entry ?? '')))
      .filter((entry): entry is string => Boolean(entry))
      .slice(0, RECENT_COMMUNITY_DAOS_LIMIT);
  } catch {
    return [];
  }
}

export function rememberCommunityDao(daoAccountId: string): string[] {
  const id = normalizeProtocolDaoAccountId(daoAccountId);
  if (!id || typeof window === 'undefined') return readRecentCommunityDaos();
  const next = [
    id,
    ...readRecentCommunityDaos().filter((entry) => entry !== id),
  ].slice(0, RECENT_COMMUNITY_DAOS_LIMIT);
  try {
    window.localStorage.setItem(RECENT_COMMUNITY_DAOS_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
  return next;
}
