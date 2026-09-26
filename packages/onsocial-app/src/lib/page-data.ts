import { cache } from 'react';
import { unstable_noStore as noStore } from 'next/cache';
import type { OnSocial } from '@onsocial/sdk';
import { ACTIVE_API_URL } from '@/lib/app-config';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { isHeuristicDaoAccountId } from '@/lib/enrich-standing-with-dao';
import { loadProfileShell, type AppProfileShell } from '@/lib/profile-shell';

export interface PublicPageProfile {
  name?: string;
  bio?: string;
  avatar?: string;
  links?: Array<{ label: string; url: string }>;
  tags?: string[];
}

export interface PublicPageTheme {
  primary?: string;
  background?: string;
  text?: string;
  accent?: string;
  moodTints?: Record<string, number>;
}

export type PageAvatarMode = 'standard' | 'cover';

export type PageHeroSource = 'banner' | 'avatar' | 'none';

export type ResolvedPageHeroKind = 'image' | 'video';

/** Resolved hero for render — always from profile media, never page config. */
export interface ResolvedPageHero {
  kind: ResolvedPageHeroKind;
  url: string;
  poster?: string;
}

export interface PublicPageFace {
  avatarMode?: PageAvatarMode;
  heroSource?: PageHeroSource;
  /** One audio drop pinned on the portfolio. */
  songId?: string;
  /**
   * Track that plays first, counting from 0. Omitted starts at the first track.
   * Only stored when it is later than the first.
   */
  songStart?: number;
  /** One book or issue pinned on the portfolio. */
  bookId?: string;
}

export interface PublicPageConfig {
  template?: string;
  theme?: PublicPageTheme;
  face?: PublicPageFace;
  sections?: string[];
  /** Featured peek ids per Launch chapter (max 3). */
  sectionPins?: Partial<Record<string, string[]>>;
  /** Optional Launch link blurbs keyed by profile link key. */
  linkNotes?: Record<string, string>;
  tagline?: string;
  customCss?: string;
  /** Active mood broadcast — stored in `page/main.mood`. */
  mood?: {
    id?: string;
    since?: number;
    note?: string;
  };
  /** Premium mood unlock receipts — keyed by mood id. */
  moodUnlocks?: Record<
    string,
    {
      since: number;
      purchaseTxHash?: string;
    }
  >;
}

export interface PublicPageStats {
  standingCount: number;
  postCount: number;
  badgeCount: number;
  groupCount: number;
}

export interface PublicPageData {
  accountId: string;
  activated?: boolean;
  /** Legacy aggregate field — OnPage SSR uses indexed profile shell instead. */
  profile: PublicPageProfile;
  config: PublicPageConfig;
  stats: PublicPageStats;
  recentPosts: unknown[];
  badges: unknown[];
}

export type NearNetwork = 'mainnet' | 'testnet';

const ACTIVE_NEAR_NETWORK: NearNetwork =
  process.env.NEAR_NETWORK === 'mainnet' ||
  process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet'
    ? 'mainnet'
    : 'testnet';

const EMPTY_STATS: PublicPageStats = {
  standingCount: 0,
  postCount: 0,
  badgeCount: 0,
  groupCount: 0,
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

const PUBLIC_PAGE_BASE_DOMAIN =
  ACTIVE_NEAR_NETWORK === 'mainnet' ? 'onsocial.id' : 'testnet.onsocial.id';

function shortcutSubdomain(accountId: string): string | null {
  const subdomain = accountId.replace(/\.testnet$|\.near$/, '');
  if (!subdomain || subdomain.includes('.')) {
    return null;
  }

  return subdomain;
}

export function getActiveNearNetwork(): NearNetwork {
  return ACTIVE_NEAR_NETWORK;
}

export function getShortcutProfileUrl(accountId: string): string | null {
  const subdomain = shortcutSubdomain(accountId);
  if (!subdomain) {
    return null;
  }

  return `https://${subdomain}.${PUBLIC_PAGE_BASE_DOMAIN}`;
}

export function resolvePageAvatarMode(
  config: PublicPageConfig,
  override?: string | string[] | null
): PageAvatarMode {
  const candidate = Array.isArray(override) ? override[0] : override;
  if (candidate === 'cover' || candidate === 'standard') {
    return candidate;
  }

  return config.face?.avatarMode ?? 'standard';
}

/** Mirrors gateway `hasPageActivationData` — profile shell + page config. */
export function hasPageActivationData(
  profile: {
    name?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    links?: Record<string, string> | null;
    tags?: string[];
  } | null,
  pageConfig: PublicPageConfig
): boolean {
  return Boolean(
    profile?.name?.trim() ||
      profile?.bio?.trim() ||
      profile?.avatarUrl?.trim() ||
      (profile?.links && Object.keys(profile.links).length > 0) ||
      profile?.tags?.length ||
      Object.keys(pageConfig).length
  );
}

/**
 * Gateway `/data/account/exists` is only for unknown empty accounts.
 * Live indexer faces and DAO orgs skip that hop so TTFB is not blocked,
 * and an exists 404 cannot blank a page the indexer already has.
 */
export function publicPageNeedsExistsProbe(opts: {
  isDao: boolean;
  hasShell: boolean;
  activated: boolean;
}): boolean {
  return !opts.isDao && !opts.hasShell && !opts.activated;
}

function activationProfileFromShell(
  shell: AppProfileShell | null
): Parameters<typeof hasPageActivationData>[0] {
  if (!shell) return null;
  return {
    name: shell.name,
    bio: shell.bio,
    avatarUrl: shell.avatarUrl,
    links: shell.links ?? null,
    tags: shell.tags,
  };
}

async function fetchAccountExists(accountId: string): Promise<boolean | null> {
  const response = await fetch(
    `${stripTrailingSlash(ACTIVE_API_URL)}/data/account/exists?accountId=${encodeURIComponent(accountId)}`,
    {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    }
  );

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as { exists?: boolean };
  return body.exists === true;
}

async function fetchPublicPageDataFromGateway(
  accountId: string
): Promise<PublicPageData | null> {
  const response = await fetch(
    `${stripTrailingSlash(ACTIVE_API_URL)}/data/page?accountId=${encodeURIComponent(accountId)}`,
    {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (response.status === 429 || response.status >= 502) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Gateway returned ${response.status} for ${accountId}`);
  }

  return (await response.json()) as PublicPageData;
}

async function fetchPublicPageDataFromIndexer(
  os: OnSocial,
  accountId: string
): Promise<PublicPageData | null> {
  // Indexer page/main + React-cached shell (shared with /@account and About).
  // Never SSR chain. Empty/lag still soft-fills once exists allows it.
  const [shell, indexedConfig] = await Promise.all([
    loadProfileShell(accountId),
    os.query.pages.getConfig(accountId).catch(() => null),
  ]);

  const config = (indexedConfig ?? {}) as PublicPageConfig;
  const activated = hasPageActivationData(
    activationProfileFromShell(shell),
    config
  );

  if (
    publicPageNeedsExistsProbe({
      isDao: isHeuristicDaoAccountId(accountId),
      hasShell: Boolean(shell),
      activated,
    })
  ) {
    const exists = await fetchAccountExists(accountId);
    if (exists === false) {
      return null;
    }
  }

  return {
    accountId,
    activated,
    profile: {},
    config,
    stats: EMPTY_STATS,
    recentPosts: [],
    badges: [],
  };
}

export const fetchPublicPageData = cache(
  async (accountId: string): Promise<PublicPageData | null> => {
    noStore();

    try {
      const os = createServerOnSocialClient();
      return await fetchPublicPageDataFromIndexer(os, accountId);
    } catch {
      return fetchPublicPageDataFromGateway(accountId);
    }
  }
);
