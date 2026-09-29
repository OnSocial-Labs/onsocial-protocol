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
import {
  partitionDaoPurposeFaceAbout,
  resolveStoredProfileFaceAbout,
} from '@/lib/profile-bio-face';
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

export const EMPTY_PORTFOLIO_DAO_CONTEXT: PortfolioDaoContext = {
  entity: EMPTY_ENTITY,
  page: null,
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
  const { face, about } = resolveStoredProfileFaceAbout(profile.bio, null);
  return {
    accountId,
    name: profile.name?.trim() || null,
    location: null,
    industry: null,
    kind: null,
    bio: face.trim() || null,
    about: about.trim() || null,
    lead: null,
    aboutAlign: 'left',
    avatarUrl,
    bannerUrl,
    avatarMedia: avatarUrl ? { kind: 'image', url: avatarUrl } : null,
    bannerMedia: bannerUrl ? { kind: 'image', url: bannerUrl } : null,
    links: {},
    tags: [],
    photos: [],
    hashtags: [],
    tickers: [],
    mentions: [],
  };
}

async function resolveSputnikConfig(
  accountId: string,
  catalogRow: DaoCatalogLookupRow | null
): Promise<SputnikConfigView | null> {
  // Live chain wins — catalog can lag after ChangeConfig finalize.
  const chainConfig = await getProtocolDaoConfig(accountId).catch(() => null);
  if (chainConfig) {
    const name = chainConfig.name?.trim() ?? '';
    const purpose = chainConfig.purpose?.trim() ?? '';
    const metadata = chainConfig.metadata?.trim() ?? '';
    if (name || purpose || metadata) {
      return { name, purpose, metadata };
    }
  }
  return configFromCatalogRow(catalogRow);
}

/** Written by the old Activate action. It is not a profile bio. */
const STOCK_PAGE_TAGLINE = 'Welcome to my OnSocial page.';

function readablePageTagline(raw?: string | null): string {
  const text = raw?.trim() ?? '';
  if (!text || text === STOCK_PAGE_TAGLINE) return '';
  return text;
}

/**
 * Face copy.
 * Person: profile bio, then a real page tagline only when the bio is empty.
 * DAO: published face, then a clamped profile bio, then a clamped purpose.
 * A page tagline does not cover a DAO face.
 */
export function resolveDaoPortfolioSummary(opts: {
  tagline?: string | null;
  shellBio?: string | null;
  daoPage?: DaoPageData | null;
}): string | null {
  const tagline = readablePageTagline(opts.tagline);
  const description = opts.daoPage?.branding.description?.trim() || '';
  const shellFace = partitionDaoPurposeFaceAbout(
    opts.shellBio ?? ''
  ).face.trim();
  const purposeFace = partitionDaoPurposeFaceAbout(
    opts.daoPage?.configPurpose ?? ''
  ).face.trim();

  if (opts.daoPage) {
    return description || shellFace || purposeFace || tagline || null;
  }

  return opts.shellBio?.trim() || tagline || null;
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
    resolvedProfileShell ?? profileShellFromBundle(id, bundle.profile) ?? null;

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
 * Sputnik config prefers live `get_config`; catalog fills when RPC is down.
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
