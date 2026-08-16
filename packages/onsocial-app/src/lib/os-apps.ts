import { accountIdsEqual } from '@/lib/account-match';
import {
  APP_APPS_PATH,
  APP_COLLECTION_PATH,
  APP_COLLECTIBLES_PATH,
  APP_DAO_PATH,
  APP_DAOS_PATH,
  APP_DISCOVER_PATH,
  APP_DROPS_PATH,
  APP_GROUPS_PATH,
  APP_HOME_PATH,
  APP_MARKET_PATH,
  APP_PROTOCOL_PATH,
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

/**
 * Which launcher app is "here" for the current route.
 * External portals (Boost) are never active in-app.
 * Hubs covers `/apps` and drop pages under `/collection`.
 */
export function resolveActiveOsAppId(
  pathname: string,
  viewerAccountId?: string | null
): string | null {
  const path = pathname.split(/[?#]/)[0] ?? pathname;

  if (path === APP_HOME_PATH || path.startsWith(`${APP_HOME_PATH}/`)) {
    return 'home';
  }
  if (path === APP_DISCOVER_PATH || path.startsWith(`${APP_DISCOVER_PATH}/`)) {
    return 'discover';
  }
  if (path === APP_APPS_PATH || path.startsWith(`${APP_APPS_PATH}/`)) {
    return 'hubs';
  }
  if (
    path === APP_COLLECTION_PATH ||
    path.startsWith(`${APP_COLLECTION_PATH}/`)
  ) {
    return 'hubs';
  }
  if (path === APP_MARKET_PATH || path.startsWith(`${APP_MARKET_PATH}/`)) {
    return 'market';
  }
  if (path === APP_DROPS_PATH || path.startsWith(`${APP_DROPS_PATH}/`)) {
    return 'drops';
  }
  if (
    path === APP_COLLECTIBLES_PATH ||
    path.startsWith(`${APP_COLLECTIBLES_PATH}/`)
  ) {
    return 'collectibles';
  }
  if (path === APP_GROUPS_PATH || path.startsWith(`${APP_GROUPS_PATH}/`)) {
    return 'groups';
  }
  if (path === APP_DAOS_PATH || path.startsWith(`${APP_DAOS_PATH}/`)) {
    return 'daos';
  }
  if (path === APP_DAO_PATH || path.startsWith(`${APP_DAO_PATH}/`)) {
    return 'daos';
  }
  if (
    path === APP_PROTOCOL_PATH ||
    path.startsWith(`${APP_PROTOCOL_PATH}/`)
  ) {
    return 'protocol';
  }

  const portfolio = path.match(/^\/@([^/]+)(?:\/([^/]+))?/);
  if (!portfolio?.[1]) return null;

  const accountId = decodeURIComponent(portfolio[1]);
  const panel = portfolio[2] ?? null;

  if (panel === 'discover') return 'discover';
  if (panel === 'feed') return 'home';

  if (
    viewerAccountId &&
    accountIdsEqual(accountId, viewerAccountId) &&
    (!panel ||
      panel === 'standing' ||
      panel === 'endorsements' ||
      panel === 'reputation')
  ) {
    return 'page';
  }

  return null;
}

/** Match tile id to {@link resolveActiveOsAppId} (aliases: feed↔home, my-page↔page). */
export function isOsAppActive(appId: string, activeId: string | null): boolean {
  if (!activeId) return false;
  if (appId === activeId) return true;
  if (activeId === 'home' && (appId === 'home' || appId === 'feed')) {
    return true;
  }
  if (activeId === 'page' && (appId === 'page' || appId === 'my-page')) {
    return true;
  }
  return false;
}

const OS_EXTERNAL_LINKS: OsAppLink[] = [
  {
    id: 'boost',
    label: 'Boost',
    kind: 'external',
    href: portalHref('/boost'),
  },
];

const PROTOCOL_APP: OsAppLink = {
  id: 'protocol',
  label: 'Protocol',
  kind: 'app',
  href: APP_PROTOCOL_PATH,
};

const DAOS_APP: OsAppLink = {
  id: 'daos',
  label: 'DAOs',
  kind: 'app',
  href: APP_DAOS_PATH,
};

const HUBS_APP: OsAppLink = {
  id: 'hubs',
  label: 'Hubs',
  kind: 'app',
  href: APP_APPS_PATH,
};

const COLLECTIBLES_APP: OsAppLink = {
  id: 'collectibles',
  label: 'Collectibles',
  kind: 'app',
  href: APP_COLLECTIBLES_PATH,
};

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
    },
    {
      id: 'drops',
      label: 'Drops',
      kind: 'app',
      href: APP_DROPS_PATH,
    },
    COLLECTIBLES_APP,
    HUBS_APP,
    {
      id: 'groups',
      label: 'Guilds',
      kind: 'app',
      href: APP_GROUPS_PATH,
    },
    DAOS_APP,
    {
      id: 'boost',
      label: 'Boost',
      kind: 'external',
      href: portalHref('/boost'),
    },
    PROTOCOL_APP,
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
    },
    {
      id: 'drops',
      label: 'Drops',
      kind: 'app',
      href: APP_DROPS_PATH,
    },
    COLLECTIBLES_APP,
    HUBS_APP,
    {
      id: 'groups',
      label: 'Guilds',
      kind: 'app',
      href: APP_GROUPS_PATH,
    },
    DAOS_APP,
    PROTOCOL_APP,
    ...OS_EXTERNAL_LINKS,
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
    {
      id: 'market',
      label: 'Market',
      kind: 'app',
      href: APP_MARKET_PATH,
    },
    {
      id: 'drops',
      label: 'Drops',
      kind: 'app',
      href: APP_DROPS_PATH,
    },
    HUBS_APP,
    {
      id: 'groups',
      label: 'Guilds',
      kind: 'app',
      href: APP_GROUPS_PATH,
    },
    DAOS_APP,
    PROTOCOL_APP,
    ...OS_EXTERNAL_LINKS,
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
    },
    {
      id: 'drops',
      label: 'Drops',
      kind: 'app',
      href: APP_DROPS_PATH,
    },
    HUBS_APP,
    {
      id: 'groups',
      label: 'Guilds',
      kind: 'app',
      href: APP_GROUPS_PATH,
    },
    DAOS_APP,
    PROTOCOL_APP,
    ...OS_EXTERNAL_LINKS,
  ];

  if (accountId) {
    // Vault sits after Market — own & use, separate from create/sell.
    const marketIdx = apps.findIndex((app) => app.id === 'market');
    const insertAt = marketIdx >= 0 ? marketIdx + 1 : apps.length;
    apps.splice(insertAt, 0, COLLECTIBLES_APP);
    apps.push({ id: 'page', label: 'Page', kind: 'open-page' });
  }

  return apps;
}
