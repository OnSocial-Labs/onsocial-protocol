export type PortalNearNetwork = 'testnet' | 'mainnet';

const DEFAULT_GOVERNANCE_WALLETS =
  'onsocial.near,onsocial.testnet,greenghost.near,greenghost.onsocial.testnet,test01greenghost.testnet';

function parseWalletList(value: string): string[] {
  return value
    .split(',')
    .map((wallet) => wallet.trim().toLowerCase())
    .filter(Boolean);
}

function getHostname(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function classifyEnvironmentHost(
  hostname: string | null
): PortalNearNetwork | 'local' | 'unknown' {
  if (!hostname) return 'unknown';

  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost')
  ) {
    return 'local';
  }

  if (hostname === 'api.onsocial.id' || hostname === 'mainnet.onsocial.id') {
    return 'mainnet';
  }

  if (hostname === 'testnet.onsocial.id') {
    return 'testnet';
  }

  return 'unknown';
}

export const ACTIVE_NEAR_NETWORK: PortalNearNetwork =
  process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

export const ACTIVE_NEAR_EXPLORER_URL =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://nearblocks.io'
    : 'https://testnet.nearblocks.io';

export const ACTIVE_API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://api.onsocial.id'
    : 'https://testnet.onsocial.id');

export const ACTIVE_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://api.onsocial.id'
    : 'https://testnet.onsocial.id');

export const GOVERNANCE_WALLETS = parseWalletList(
  process.env.NEXT_PUBLIC_GOVERNANCE_WALLETS ?? DEFAULT_GOVERNANCE_WALLETS
);

export const GOVERNANCE_DAO_ACCOUNT =
  process.env.NEXT_PUBLIC_GOVERNANCE_DAO_ACCOUNT ??
  (ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'governance.onsocial.near'
    : 'governance.onsocial.testnet');

export const GOVERNANCE_PROPOSAL_BOND =
  process.env.NEXT_PUBLIC_GOVERNANCE_PROPOSAL_BOND ??
  '1000000000000000000000000';

export const CONTRACT_OWNER_WALLET =
  ACTIVE_NEAR_NETWORK === 'mainnet' ? 'onsocial.near' : 'onsocial.testnet';

export const RELAYER_ACCOUNT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'relayer.onsocial.near'
    : 'relayer.onsocial.testnet';

export const NEAR_ACCOUNT_SUFFIX =
  ACTIVE_NEAR_NETWORK === 'mainnet' ? 'onsocial.near' : 'onsocial.testnet';

/** Minimum liquid NEAR to sign session bootstrap (AddKey + 100 TGas execute_admin). */
export const SESSION_BOOTSTRAP_MIN_YOCTO = '12000000000000000000000'; // 0.012 NEAR

/** Minimum liquid NEAR before requesting a welcome drip (yoctoNEAR). */
export const WELCOME_NEAR_THRESHOLD_YOCTO =
  process.env.NEXT_PUBLIC_WELCOME_NEAR_THRESHOLD_YOCTO ??
  SESSION_BOOTSTRAP_MIN_YOCTO;

export const WELCOME_NEAR_ENABLED =
  process.env.NEXT_PUBLIC_WELCOME_NEAR_ENABLED !== 'false';

const apiEnvironment = classifyEnvironmentHost(getHostname(ACTIVE_API_URL));
const backendEnvironment = classifyEnvironmentHost(
  getHostname(ACTIVE_BACKEND_URL)
);

export const PORTAL_RUNTIME_WARNINGS = [
  apiEnvironment !== 'unknown' &&
  apiEnvironment !== 'local' &&
  apiEnvironment !== ACTIVE_NEAR_NETWORK
    ? `NEXT_PUBLIC_API_URL points to ${apiEnvironment} while NEXT_PUBLIC_NEAR_NETWORK is ${ACTIVE_NEAR_NETWORK}.`
    : null,
  backendEnvironment !== 'unknown' &&
  backendEnvironment !== 'local' &&
  backendEnvironment !== ACTIVE_NEAR_NETWORK
    ? `NEXT_PUBLIC_BACKEND_URL points to ${backendEnvironment} while NEXT_PUBLIC_NEAR_NETWORK is ${ACTIVE_NEAR_NETWORK}.`
    : null,
  apiEnvironment !== 'unknown' &&
  backendEnvironment !== 'unknown' &&
  apiEnvironment !== 'local' &&
  backendEnvironment !== 'local' &&
  apiEnvironment !== backendEnvironment
    ? `NEXT_PUBLIC_API_URL points to ${apiEnvironment} while NEXT_PUBLIC_BACKEND_URL points to ${backendEnvironment}.`
    : null,
].filter((warning): warning is string => Boolean(warning));

export function isGovernanceWallet(wallet: string | null | undefined): boolean {
  return !!wallet && GOVERNANCE_WALLETS.includes(wallet.toLowerCase());
}

export function hasRuntimeConfigWarnings(): boolean {
  return PORTAL_RUNTIME_WARNINGS.length > 0;
}

export const PUBLIC_APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
  (ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://onsocial.id'
    : 'https://testnet.onsocial.id');

export function getPublicAppPageUrl(accountId: string): string {
  return `${PUBLIC_APP_URL}/@${encodeURIComponent(accountId)}`;
}

export function getPortalProfileUrl(accountId: string): string {
  return `/u/${encodeURIComponent(accountId)}`;
}

export type PortalStandKind = 'incoming' | 'outgoing' | 'mutual';

export interface PortalStandUrlParams {
  q?: string | null;
}

export function getPortalStandUrl(
  accountId: string,
  kind: PortalStandKind,
  params: PortalStandUrlParams = {}
): string {
  const search = new URLSearchParams();
  if (params.q?.trim()) search.set('q', params.q.trim());
  const qs = search.toString();
  return `/u/${encodeURIComponent(accountId)}/stand/${kind}${
    qs ? `?${qs}` : ''
  }`;
}

/** Update the stand list address bar without a full navigation. */
export function syncPortalStandUrl(
  accountId: string,
  kind: PortalStandKind,
  params: PortalStandUrlParams = {}
): void {
  if (typeof window === 'undefined') return;
  const href = getPortalStandUrl(accountId, kind, params);
  window.history.replaceState(window.history.state, '', href);
}

export type PortalEndorsementsMode = 'received' | 'given';

export interface PortalEndorsementsUrlParams {
  mode?: PortalEndorsementsMode;
  topic?: string | null;
  issuer?: string | null;
  target?: string | null;
  q?: string | null;
}

export function getPortalEndorsementsUrl(
  accountId: string,
  params: PortalEndorsementsUrlParams = {}
): string {
  const search = new URLSearchParams();
  if (params.mode) search.set('mode', params.mode);
  if (params.topic?.trim()) search.set('topic', params.topic.trim());
  if (params.issuer?.trim()) search.set('issuer', params.issuer.trim());
  if (params.target?.trim()) search.set('target', params.target.trim());
  if (params.q?.trim()) search.set('q', params.q.trim());
  const qs = search.toString();
  return `/u/${encodeURIComponent(accountId)}/endorsements${
    qs ? `?${qs}` : ''
  }`;
}

export type PortalNetworkFilter = 'all' | 'mutual' | 'incoming' | 'outgoing';

export interface PortalNetworkUrlParams {
  filter?: PortalNetworkFilter;
  q?: string | null;
}

export function getPortalNetworkUrl(
  accountId: string,
  params: PortalNetworkUrlParams = {}
): string {
  const search = new URLSearchParams();
  if (params.filter && params.filter !== 'all') {
    search.set('filter', params.filter);
  }
  if (params.q?.trim()) search.set('q', params.q.trim());
  const qs = search.toString();
  return `/u/${encodeURIComponent(accountId)}/network${qs ? `?${qs}` : ''}`;
}

/** Update the address bar without remounting the network page (avoids full graph reload). */
export function syncPortalNetworkUrl(
  accountId: string,
  params: PortalNetworkUrlParams = {}
): void {
  if (typeof window === 'undefined') return;
  const href = getPortalNetworkUrl(accountId, params);
  window.history.replaceState(window.history.state, '', href);
}

export function getPortalDiscoverUrl(): string {
  return '/discover';
}

export function openPublicAppProfile(accountId: string): void {
  if (typeof window === 'undefined') return;
  window.location.assign(getPublicAppPageUrl(accountId));
}
