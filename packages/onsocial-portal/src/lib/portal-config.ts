export type PortalNearNetwork = 'testnet' | 'mainnet';

const DEFAULT_ADMIN_WALLETS =
  'onsocial.near,onsocial.testnet,greenghost.near,test01greenghost.testnet';

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
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://api.onsocial.id';

export const ADMIN_WALLETS = parseWalletList(
  process.env.NEXT_PUBLIC_ADMIN_WALLETS ?? DEFAULT_ADMIN_WALLETS
);

export const CONTRACT_OWNER_WALLET =
  ACTIVE_NEAR_NETWORK === 'mainnet' ? 'onsocial.near' : 'onsocial.testnet';

export const RELAYER_ACCOUNT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'relayer.onsocial.near'
    : 'relayer.onsocial.testnet';

export const NEAR_ACCOUNT_SUFFIX =
  ACTIVE_NEAR_NETWORK === 'mainnet' ? 'onsocial.near' : 'onsocial.testnet';

const apiEnvironment = classifyEnvironmentHost(getHostname(ACTIVE_API_URL));
const backendEnvironment = classifyEnvironmentHost(getHostname(ACTIVE_BACKEND_URL));

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

export function isAdminWallet(wallet: string | null | undefined): boolean {
  return !!wallet && ADMIN_WALLETS.includes(wallet.toLowerCase());
}

export function hasRuntimeConfigWarnings(): boolean {
  return PORTAL_RUNTIME_WARNINGS.length > 0;
}

