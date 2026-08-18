/**
 * Pure helpers: classify + brand standing rows as DAO orgs from catalog data.
 */

import { parseDaoBrandingMetadata } from '@/features/protocol/dao-branding';
import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/app-config';
import type { DaoCatalogLookupRow } from '@/lib/dao-catalog-lookup';
import { resolveProfileMediaUrl } from '@/lib/profile-display';

const SPUTNIK_DAO_SUFFIXES = [
  '.sputnik-dao.near',
  '.sputnikv2.near',
  '.sputnik-dao.testnet',
  '.sputnikv2.testnet',
] as const;

export type StandingDaoEnrichmentInput = {
  accountId: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
};

export type StandingDaoEnrichmentResult = StandingDaoEnrichmentInput & {
  isDao: boolean;
};

function normalizeAccountId(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function isHeuristicDaoAccountId(
  accountId: string | null | undefined
): boolean {
  const id = normalizeAccountId(accountId);
  if (!id) return false;
  if (id === GOVERNANCE_DAO_ACCOUNT.trim().toLowerCase()) return true;
  if (id === TREASURY_DAO_ACCOUNT.trim().toLowerCase()) return true;
  return SPUTNIK_DAO_SUFFIXES.some((suffix) => id.endsWith(suffix));
}

export function enrichStandingAccountWithDaoCatalog(
  account: StandingDaoEnrichmentInput,
  catalog: Map<string, DaoCatalogLookupRow>
): StandingDaoEnrichmentResult {
  const id = normalizeAccountId(account.accountId);
  const row = catalog.get(id) ?? null;
  const isDao = Boolean(row) || isHeuristicDaoAccountId(id);

  if (!isDao) {
    return { ...account, isDao: false };
  }

  if (!row) {
    return { ...account, isDao: true };
  }

  const meta = parseDaoBrandingMetadata(row.metadata);
  const catalogName = row.name?.trim() || meta?.name?.trim() || null;
  const catalogBio =
    row.purpose?.trim() || meta?.description?.trim() || null;
  const catalogAvatar =
    resolveProfileMediaUrl(meta?.avatar ?? null) ?? null;

  return {
    accountId: account.accountId,
    isDao: true,
    name: account.name?.trim() || catalogName,
    bio: account.bio?.trim() || catalogBio,
    avatarUrl: account.avatarUrl?.trim() || catalogAvatar,
  };
}
