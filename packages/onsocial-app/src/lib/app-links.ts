import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';

export interface GateDappLink {
  label: string;
  description: string;
  kind?: 'external' | 'onpage' | 'app';
  href?: string;
}

const PORTAL_ORIGIN =
  process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/$/, '') ??
  (ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://portal.onsocial.id'
    : 'https://testnet.onsocial.id');

export const PUBLIC_APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
  (ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://onsocial.id'
    : 'https://testnet.onsocial.id');

export function portalHref(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${PORTAL_ORIGIN}${normalizedPath}`;
}

export function appPageHref(accountId: string): string {
  return `${PUBLIC_APP_ORIGIN}/@${encodeURIComponent(accountId)}`;
}
