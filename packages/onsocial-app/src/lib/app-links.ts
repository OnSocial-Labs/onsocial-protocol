import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';

export interface GateDappLink {
  label: string;
  description: string;
  kind?: 'external' | 'onpage';
  href?: string;
}

const PORTAL_ORIGIN =
  process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/$/, '') ??
  (ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://onsocial.id'
    : 'https://testnet.onsocial.id');

export const PUBLIC_APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? PORTAL_ORIGIN;

export function portalHref(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${PORTAL_ORIGIN}${normalizedPath}`;
}

export function appPageHref(accountId: string): string {
  return `${PUBLIC_APP_ORIGIN}/@${encodeURIComponent(accountId)}`;
}

export const GATE_DAPPS: GateDappLink[] = [
  {
    label: 'OnPage',
    description: 'Your public OnSocial page',
    kind: 'onpage',
  },
  {
    label: 'Portal',
    href: portalHref('/'),
    description: 'Protocol home',
    kind: 'external',
  },
  {
    label: 'Boost',
    href: portalHref('/boost'),
    description: 'Rewards and standing',
    kind: 'external',
  },
  {
    label: 'Playground',
    href: portalHref('/playground'),
    description: 'Try the SDK live',
    kind: 'external',
  },
  {
    label: 'SDK',
    href: portalHref('/sdk'),
    description: 'Build on OnSocial',
    kind: 'external',
  },
  {
    label: 'Transparency',
    href: portalHref('/transparency'),
    description: 'Token and governance',
    kind: 'external',
  },
];
