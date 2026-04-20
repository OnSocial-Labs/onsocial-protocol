import { cache } from 'react';

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

export interface PublicPageConfig {
  template?: string;
  theme?: PublicPageTheme;
  sections?: string[];
  tagline?: string;
  customCss?: string;
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

const ACTIVE_API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.API_URL ??
  (ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://api.onsocial.id'
    : 'https://testnet.onsocial.id');

const PUBLIC_PAGE_BASE_DOMAIN =
  ACTIVE_NEAR_NETWORK === 'mainnet' ? 'onsocial.id' : 'testnet.onsocial.id';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

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

export const fetchPublicPageData = cache(
  async (accountId: string): Promise<PublicPageData | null> => {
    const response = await fetch(
      `${stripTrailingSlash(ACTIVE_API_URL)}/data/page?accountId=${encodeURIComponent(accountId)}`,
      {
        headers: { Accept: 'application/json' },
        next: { revalidate: 60 },
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
);
