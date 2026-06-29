import {
  APP_DISCOVER_PATH,
  APP_GROUPS_PATH,
  APP_HOME_PATH,
  APP_MARKET_PATH,
} from '@/lib/app-routes';
import { portalHref } from '@/lib/app-links';
import type { OverlayPanel } from '@/lib/overlay-routes';

export type OsAppLinkKind = 'app' | 'overlay' | 'external' | 'open-page';

export interface OsAppLink {
  id: string;
  label: string;
  kind: OsAppLinkKind;
  href?: string;
  overlay?: OverlayPanel;
  soon?: boolean;
}

export function gateOsApps(): OsAppLink[] {
  return [
    { id: 'home', label: 'Home', kind: 'app', href: APP_HOME_PATH },
    { id: 'discover', label: 'Discover', kind: 'app', href: APP_DISCOVER_PATH },
    { id: 'page', label: 'OnPage', kind: 'open-page' },
    { id: 'feed', label: 'Feed', kind: 'app', href: APP_HOME_PATH },
    {
      id: 'market',
      label: 'Market',
      kind: 'app',
      href: APP_MARKET_PATH,
      soon: true,
    },
    {
      id: 'groups',
      label: 'Groups',
      kind: 'app',
      href: APP_GROUPS_PATH,
      soon: true,
    },
    {
      id: 'boost',
      label: 'Boost',
      kind: 'external',
      href: portalHref('/boost'),
    },
    {
      id: 'protocol',
      label: 'Protocol',
      kind: 'external',
      href: portalHref('/'),
    },
  ];
}

export function ownerPortfolioOsApps(_accountId: string): OsAppLink[] {
  return [
    { id: 'home', label: 'Home', kind: 'app', href: APP_HOME_PATH },
    {
      id: 'discover',
      label: 'Discover',
      kind: 'overlay',
      overlay: 'discover',
    },
    {
      id: 'market',
      label: 'Market',
      kind: 'app',
      href: APP_MARKET_PATH,
      soon: true,
    },
    {
      id: 'groups',
      label: 'Groups',
      kind: 'app',
      href: APP_GROUPS_PATH,
      soon: true,
    },
    {
      id: 'boost',
      label: 'Boost',
      kind: 'external',
      href: portalHref('/boost'),
    },
  ];
}

export function visitorPortfolioOsApps(_accountId: string): OsAppLink[] {
  return [
    { id: 'home', label: 'Home', kind: 'app', href: APP_HOME_PATH },
    {
      id: 'discover',
      label: 'Discover',
      kind: 'overlay',
      overlay: 'discover',
    },
  ];
}

export function appShellOsApps(accountId: string | null): OsAppLink[] {
  const apps: OsAppLink[] = [
    { id: 'home', label: 'Home', kind: 'app', href: APP_HOME_PATH },
    { id: 'discover', label: 'Discover', kind: 'app', href: APP_DISCOVER_PATH },
    {
      id: 'market',
      label: 'Market',
      kind: 'app',
      href: APP_MARKET_PATH,
      soon: true,
    },
    {
      id: 'groups',
      label: 'Groups',
      kind: 'app',
      href: APP_GROUPS_PATH,
      soon: true,
    },
  ];

  if (accountId) {
    apps.push({ id: 'page', label: 'Page', kind: 'open-page' });
  }

  return apps;
}
