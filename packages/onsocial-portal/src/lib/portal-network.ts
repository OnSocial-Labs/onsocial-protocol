/**
 * Stored portal network. The deployment env is the default. A cookie overrides
 * it so one portal can read testnet or mainnet without a second build.
 */

export const PORTAL_NETWORK_COOKIE = 'onsocial_portal_network';

const PORTAL_NETWORK_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type PortalNearNetwork = 'testnet' | 'mainnet';

export interface PortalNetworkContracts {
  core: string;
  boost: string;
  token: string;
  rewards: string;
  scarces: string;
  vesting: string;
  treasury: string;
  socialSpend: string;
}

export interface PortalNetworkProfile {
  network: PortalNearNetwork;
  apiUrl: string;
  backendUrl: string;
  appUrl: string;
  explorerUrl: string;
  accountSuffix: 'near' | 'testnet';
  contracts: PortalNetworkContracts;
}

const PUBLIC_GATEWAY: Record<PortalNearNetwork, string> = {
  testnet: 'https://testnet.onsocial.id',
  mainnet: 'https://api.onsocial.id',
};

const PUBLIC_APP: Record<PortalNearNetwork, string> = {
  testnet: 'https://testnet.onsocial.id',
  mainnet: 'https://onsocial.id',
};

/**
 * Social contracts that are not deployed on mainnet yet, plus founder vesting
 * (same panel, same missing account). Token, rewards, and treasury are live.
 */
export const MAINNET_UNRELEASED_CONTRACTS = [
  'Core',
  'Boost',
  'Scarces',
  'Vesting',
] as const;

export function portalNetworkFromEnv(): PortalNearNetwork {
  return process.env.NEXT_PUBLIC_NEAR_NETWORK?.trim().toLowerCase() ===
    'mainnet'
    ? 'mainnet'
    : 'testnet';
}

export function parsePortalNetwork(
  value: string | null | undefined
): PortalNearNetwork | null {
  const raw = value?.trim().toLowerCase();
  if (raw === 'mainnet' || raw === 'testnet') return raw;
  return null;
}

export function resolvePortalNetwork(
  value: string | null | undefined
): PortalNearNetwork {
  return parsePortalNetwork(value) ?? portalNetworkFromEnv();
}

export function readPortalNetworkCookie(
  cookieHeader: string | null | undefined
): PortalNearNetwork | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== PORTAL_NETWORK_COOKIE) continue;
    return parsePortalNetwork(decodeURIComponent(rest.join('=')));
  }
  return null;
}

/** Call-time network. Browser reads the cookie. Server falls back to the build. */
export function readPortalNetwork(): PortalNearNetwork {
  if (typeof document !== 'undefined') {
    return readPortalNetworkCookie(document.cookie) ?? portalNetworkFromEnv();
  }
  return portalNetworkFromEnv();
}

export function portalNetworkCookie(network: PortalNearNetwork): string {
  const secure =
    typeof location !== 'undefined' && location.protocol === 'https:'
      ? '; Secure'
      : '';
  return `${PORTAL_NETWORK_COOKIE}=${network}; Path=/; Max-Age=${PORTAL_NETWORK_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

function trimmedEnv(name: string): string | null {
  const value = process.env[name]?.trim().replace(/\/$/, '');
  return value || null;
}

export function portalNetworkProfile(
  network: PortalNearNetwork
): PortalNetworkProfile {
  const suffix = network === 'mainnet' ? 'near' : 'testnet';
  const id = (name: string) => `${name}.onsocial.${suffix}`;
  const useBuildEnv = network === portalNetworkFromEnv();

  return {
    network,
    apiUrl:
      (useBuildEnv ? trimmedEnv('NEXT_PUBLIC_API_URL') : null) ??
      PUBLIC_GATEWAY[network],
    backendUrl:
      (useBuildEnv ? trimmedEnv('NEXT_PUBLIC_BACKEND_URL') : null) ??
      PUBLIC_GATEWAY[network],
    appUrl:
      (useBuildEnv ? trimmedEnv('NEXT_PUBLIC_APP_URL') : null) ??
      PUBLIC_APP[network],
    explorerUrl:
      network === 'mainnet'
        ? 'https://nearblocks.io'
        : 'https://testnet.nearblocks.io',
    accountSuffix: suffix,
    contracts: {
      core: id('core'),
      boost: id('boost'),
      token: id('token'),
      rewards: id('rewards'),
      scarces: id('scarces'),
      vesting: id('founder-vesting'),
      treasury: id('treasury'),
      socialSpend: id('social-spend'),
    },
  };
}

export function isUnreleasedMainnetContract(
  network: PortalNearNetwork,
  name: string
): boolean {
  return (
    network === 'mainnet' &&
    (MAINNET_UNRELEASED_CONTRACTS as readonly string[]).includes(name)
  );
}

export function isPortalSwapEnabled(network: PortalNearNetwork): boolean {
  return network === 'mainnet';
}

/**
 * Portal social paths that open the app. Unknown paths return null so portal
 * routes such as /season/admin stay put.
 */
export function socialHandoffDestination(
  pathname: string,
  appUrl: string
): string | null {
  const base = appUrl.replace(/\/$/, '');
  const parts = pathname.split('/').filter(Boolean);
  const [head, account, ...rest] = parts;

  if (head === 'discover' && parts.length === 1) {
    return `${base}/discover`;
  }
  if (
    head === 'boost' &&
    (parts.length === 1 || (parts.length === 2 && account === 'leaderboard'))
  ) {
    return `${base}/home?sheet=boost`;
  }
  if (head === 'season' && parts.length === 1) {
    return `${base}/home?sheet=rally`;
  }
  if (head === 'season-zero' && parts.length === 1) {
    return `${base}/home?sheet=rally&season=season-zero`;
  }
  if (head !== 'u' || !account) return null;

  const person = encodeURIComponent(decodeURIComponent(account));
  if (rest.length === 0) return `${base}/@${person}`;
  if (rest.length === 1 && rest[0] === 'network') {
    return `${base}/@${person}/network`;
  }
  if (rest[0] === 'endorsements') {
    return `${base}/@${person}/endorsements`;
  }
  if (rest[0] === 'stand' && rest.length === 2) {
    const kind =
      rest[1] === 'solidarity'
        ? 'mutual'
        : rest[1] === 'standing' || rest[1] === 'standings'
          ? 'incoming'
          : rest[1];
    return `${base}/@${person}/standing/${encodeURIComponent(kind)}`;
  }
  return null;
}
