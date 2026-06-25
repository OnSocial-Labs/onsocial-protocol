import { cache } from 'react';
import { unstable_noStore as noStore } from 'next/cache';
import type { OnSocial } from '@onsocial/sdk';
import { ACTIVE_API_URL } from '@/lib/app-config';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

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
}

export interface PublicPageConfig {
  template?: string;
  theme?: PublicPageTheme;
  face?: PublicPageFace;
  sections?: string[];
  tagline?: string;
  customCss?: string;
  /** Active mood broadcast — stored in `page/main.mood`. */
  mood?: {
    id?: string;
    since?: number;
    note?: string;
  };
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

  if (!response.ok) {
    throw new Error(`Gateway returned ${response.status} for ${accountId}`);
  }

  return (await response.json()) as PublicPageData;
}

async function fetchPublicPageDataFromIndexer(
  os: OnSocial,
  accountId: string
): Promise<PublicPageData | null> {
  const [exists, materialisedProfile, config] = await Promise.all([
    fetchAccountExists(accountId),
    os.profiles.get(accountId),
    os.pages.getConfig(accountId),
  ]);

  if (exists === false) {
    return null;
  }

  const activated = hasPageActivationData(
    materialisedProfile
      ? {
          name: materialisedProfile.name ?? null,
          bio: materialisedProfile.bio ?? null,
          avatarUrl: os.profiles.avatarUrl(materialisedProfile),
          links: materialisedProfile.links ?? null,
          tags: materialisedProfile.tags ?? [],
        }
      : null,
    config
  );

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
