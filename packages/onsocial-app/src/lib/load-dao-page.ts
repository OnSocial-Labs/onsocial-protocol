import { cache } from 'react';
import {
  composeDaoBranding,
  daoEntityKindLabel,
  type DaoBranding,
  resolveDaoEntityKind,
} from '@/features/protocol/dao-branding';
import { getProtocolDaoConfig } from '@/features/protocol/protocol-eligibility';
import {
  fetchDaoPortfolioPageBundle,
  type DaoCatalogLookupRow,
  type DaoPortfolioProfileBundle,
} from '@/lib/dao-catalog-lookup';
import { daoPath } from '@/lib/app-routes';
import { isHeuristicDaoAccountId } from '@/lib/enrich-standing-with-dao';
import { resolveProfileMediaUrl } from '@/lib/profile-display';
import { loadProfileShell, type AppProfileShell } from '@/lib/profile-shell';

export type PortfolioDaoEntity = {
  isDao: boolean;
  kindLabel: string | null;
  workspaceHref: string | null;
};

export interface DaoPageData {
  branding: DaoBranding;
  configName: string | null;
  configPurpose: string | null;
  configMetadata: string;
}

export type PortfolioDaoContext = {
  entity: PortfolioDaoEntity;
  page: DaoPageData | null;
};

type SputnikConfigView = {
  name: string;
  purpose: string;
  metadata: string;
};

const EMPTY_ENTITY: PortfolioDaoEntity = {
  isDao: false,
  kindLabel: null,
  workspaceHref: null,
};

function configFromCatalogRow(
  row: DaoCatalogLookupRow | null | undefined
): SputnikConfigView | null {
  if (!row) return null;
  const name = row.name?.trim() ?? '';
  const purpose = row.purpose?.trim() ?? '';
  const metadata = row.metadata?.trim() ?? '';
  if (!name && !purpose && !metadata) return null;
  return { name, purpose, metadata };
}

function entityForDao(accountId: string): PortfolioDaoEntity {
  return {
    isDao: true,
    kindLabel: daoEntityKindLabel(resolveDaoEntityKind(accountId)),
    workspaceHref: daoPath(accountId),
  };
}

function profileShellFromBundle(
  accountId: string,
  profile: DaoPortfolioProfileBundle | null | undefined
): AppProfileShell | null {
  if (!profile) return null;
  const avatarUrl = resolveProfileMediaUrl(profile.avatar);
  const bannerUrl = resolveProfileMediaUrl(profile.banner);
  return {
    accountId,
    name: profile.name?.trim() || null,
    bio: profile.bio?.trim() || null,
    avatarUrl,
    bannerUrl,
    avatarMedia: avatarUrl ? { kind: 'image', url: avatarUrl } : null,
    bannerMedia: bannerUrl ? { kind: 'image', url: bannerUrl } : null,
    links: null,
    tags: [],
    hashtags: [],
    tickers: [],
    mentions: [],
  };
}

async function resolveSputnikConfig(
  accountId: string,
  catalogRow: DaoCatalogLookupRow | null
): Promise<SputnikConfigView | null> {
  const fromCatalog = configFromCatalogRow(catalogRow);
  if (fromCatalog) return fromCatalog;

  const chainConfig = await getProtocolDaoConfig(accountId).catch(() => null);
  if (!chainConfig) return null;

  const name = chainConfig.name?.trim() ?? '';
  const purpose = chainConfig.purpose?.trim() ?? '';
  const metadata = chainConfig.metadata?.trim() ?? '';
  if (!name && !purpose && !metadata) return null;
  return { name, purpose, metadata };
}

/** Face copy — tagline wins; then profile bio; then catalog / Sputnik purpose. */
export function resolveDaoPortfolioSummary(opts: {
  tagline?: string | null;
  shellBio?: string | null;
  daoPage?: DaoPageData | null;
}): string | null {
  return (
    opts.tagline?.trim() ||
    opts.shellBio?.trim() ||
    opts.daoPage?.branding.description?.trim() ||
    opts.daoPage?.configPurpose?.trim() ||
    null
  );
}

async function resolvePortfolioDaoContext(
  accountId: string,
  profileShell?: AppProfileShell | null
): Promise<PortfolioDaoContext> {
  const id = accountId.trim();
  const normalized = id.toLowerCase();
  if (!normalized) {
    return { entity: EMPTY_ENTITY, page: null };
  }

  const [bundle, resolvedProfileShell] = await Promise.all([
    fetchDaoPortfolioPageBundle(normalized),
    profileShell !== undefined
      ? Promise.resolve(profileShell)
      : loadProfileShell(id).catch(() => null),
  ]);

  const profile =
    resolvedProfileShell ??
    profileShellFromBundle(id, bundle.profile) ??
    null;

  const catalogRow = bundle.dao;
  const isDao = isHeuristicDaoAccountId(normalized) || Boolean(catalogRow);
  if (!isDao) {
    return { entity: EMPTY_ENTITY, page: null };
  }

  const sputnikConfig = await resolveSputnikConfig(id, catalogRow);
  const branding = composeDaoBranding({
    daoAccountId: id,
    profile,
    config: sputnikConfig,
  });

  return {
    entity: entityForDao(id),
    page: {
      branding,
      configName: sputnikConfig?.name?.trim() || null,
      configPurpose: sputnikConfig?.purpose?.trim() || null,
      configMetadata: sputnikConfig?.metadata ?? '',
    },
  };
}

/**
 * SSR bundle for DAO portfolio faces — backend catalog + indexed profile shell.
 * Sputnik config prefers `governance_dao_catalog`; chain view fills sync gaps.
 */
export const loadPortfolioDaoContext = cache(async (accountId: string) =>
  resolvePortfolioDaoContext(accountId)
);

/** Reuses an already-loaded indexed profile shell (full SDK materialisation). */
export async function loadPortfolioDaoContextWithProfile(
  accountId: string,
  profileShell: AppProfileShell | null
): Promise<PortfolioDaoContext> {
  return resolvePortfolioDaoContext(accountId, profileShell);
}

export async function resolvePortfolioDaoEntity(
  accountId: string
): Promise<PortfolioDaoEntity> {
  return (await loadPortfolioDaoContext(accountId)).entity;
}

export async function loadDaoPageData(
  daoAccountId: string
): Promise<DaoPageData | null> {
  return (await loadPortfolioDaoContext(daoAccountId)).page;
}
