/**
 * Shared DAO directory list model — place banner + square crest identity.
 */

import {
  PROTOCOL_COMMUNITY_DAO_SEED,
  resolveKnownBoardForDaoAccount,
} from '@/features/protocol/dao-accounts';
import {
  daoEntityKindLabel,
  parseDaoBrandingMetadata,
} from '@/features/protocol/dao-branding';
import type { DaoCatalogEntry } from '@/features/protocol/dao-catalog-client';
import type { MyDaoMembership } from '@/features/protocol/my-daos-client';
import { daoPath } from '@/lib/app-routes';
import { readDaoBrandingCache } from '@/lib/dao-shell-cache';
import { formatDaoRoleLabel, sortDaoRoleIds } from '@/lib/page-drawer-meta';
import { resolveProfileMediaUrl } from '@/lib/profile-display';

export type DaoDirectoryEntry = {
  accountId: string;
  name: string;
  /** Roles, purpose, or short kind line under the identity. */
  subtitle: string;
  kindLabel: string;
  avatarUrl: string | null;
  /** Place banner for Mine / Discover place cards. */
  bannerUrl: string | null;
  href: string;
};

function seedLabel(accountId: string): string | null {
  return (
    PROTOCOL_COMMUNITY_DAO_SEED.find((entry) => entry.accountId === accountId)
      ?.label ?? null
  );
}

function seedDescription(accountId: string): string | null {
  return (
    PROTOCOL_COMMUNITY_DAO_SEED.find((entry) => entry.accountId === accountId)
      ?.description ?? null
  );
}

export function resolveDaoDirectoryCrest(
  accountId: string,
  metadata?: string | null
): string | null {
  const cached = readDaoBrandingCache(accountId);
  if (cached?.avatarUrl) return cached.avatarUrl;
  const parsed = parseDaoBrandingMetadata(metadata);
  return resolveProfileMediaUrl(parsed?.avatar ?? null);
}

export function resolveDaoDirectoryBanner(
  accountId: string,
  metadata?: string | null
): string | null {
  const cached = readDaoBrandingCache(accountId);
  if (cached?.bannerUrl) return cached.bannerUrl;
  const parsed = parseDaoBrandingMetadata(metadata);
  return resolveProfileMediaUrl(parsed?.banner ?? null);
}

export function resolveDaoDirectoryName(
  accountId: string,
  opts?: {
    name?: string | null;
    metadata?: string | null;
  }
): string {
  const cached = readDaoBrandingCache(accountId);
  if (cached?.name?.trim()) return cached.name.trim();
  const fromMeta = parseDaoBrandingMetadata(opts?.metadata)?.name?.trim();
  if (fromMeta) return fromMeta;
  if (opts?.name?.trim()) return opts.name.trim();
  return seedLabel(accountId) ?? accountId;
}

function kindLabelFor(accountId: string): string {
  const board = resolveKnownBoardForDaoAccount(accountId) ?? 'community';
  return daoEntityKindLabel(board);
}

export function daoDirectoryEntryFromMembership(
  row: MyDaoMembership
): DaoDirectoryEntry {
  const roleIds = sortDaoRoleIds(row.roleNames);
  const roleLabels = roleIds.map(formatDaoRoleLabel).filter(Boolean);
  const subtitle =
    roleLabels.length > 0
      ? roleLabels.join(' · ')
      : seedDescription(row.daoAccountId) ??
        row.purpose?.trim() ??
        'DAO membership';

  return {
    accountId: row.daoAccountId,
    name: resolveDaoDirectoryName(row.daoAccountId, {
      name: row.name,
      metadata: row.metadata,
    }),
    subtitle,
    kindLabel: kindLabelFor(row.daoAccountId),
    avatarUrl: resolveDaoDirectoryCrest(row.daoAccountId, row.metadata),
    bannerUrl: resolveDaoDirectoryBanner(row.daoAccountId, row.metadata),
    href: daoPath(row.daoAccountId),
  };
}

export function daoDirectoryEntryFromCatalog(
  row: DaoCatalogEntry
): DaoDirectoryEntry {
  return {
    accountId: row.daoAccountId,
    name: resolveDaoDirectoryName(row.daoAccountId, {
      name: row.name,
      metadata: row.metadata,
    }),
    subtitle: row.purpose?.trim() || 'Sputnik DAO',
    kindLabel: kindLabelFor(row.daoAccountId),
    avatarUrl: resolveDaoDirectoryCrest(row.daoAccountId, row.metadata),
    bannerUrl: resolveDaoDirectoryBanner(row.daoAccountId, row.metadata),
    href: daoPath(row.daoAccountId),
  };
}

export function daoDirectoryEntryFromSeed(accountId: string): DaoDirectoryEntry {
  const seed = PROTOCOL_COMMUNITY_DAO_SEED.find(
    (entry) => entry.accountId === accountId
  );
  return {
    accountId,
    name: resolveDaoDirectoryName(accountId, { name: seed?.label }),
    subtitle: seed?.description ?? kindLabelFor(accountId),
    kindLabel: kindLabelFor(accountId),
    avatarUrl: resolveDaoDirectoryCrest(accountId, null),
    bannerUrl: resolveDaoDirectoryBanner(accountId, null),
    href: daoPath(accountId),
  };
}

export function daoDirectoryEntryFromRecent(
  accountId: string
): DaoDirectoryEntry {
  return {
    accountId,
    name: resolveDaoDirectoryName(accountId),
    subtitle: 'Recently opened',
    kindLabel: kindLabelFor(accountId),
    avatarUrl: resolveDaoDirectoryCrest(accountId, null),
    bannerUrl: resolveDaoDirectoryBanner(accountId, null),
    href: daoPath(accountId),
  };
}
