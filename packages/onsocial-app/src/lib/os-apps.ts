import { accountIdsEqual } from '@/lib/account-match';
import { GOVERNANCE_DAO_ACCOUNT, TREASURY_DAO_ACCOUNT } from '@/lib/app-config';
import { isHeuristicDaoAccountId } from '@/lib/enrich-standing-with-dao';
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
  APP_MARKET_CREATE_PATH,
  APP_MARKET_PATH,
  APP_MESSAGES_PATH,
  APP_NOTIFICATIONS_PATH,
  APP_PROTOCOL_PATH,
} from '@/lib/app-routes';
import {
  portfolioCollectiblesPath,
  discoverPath,
  type OverlayPanel,
} from '@/lib/overlay-routes';

export type OsAppLinkKind = 'app' | 'overlay' | 'external' | 'open-page';

export interface OsAppLink {
  id: string;
  label: string;
  kind: OsAppLinkKind;
  href?: string;
  overlay?: OverlayPanel;
  soon?: boolean;
  /** Community-board icon. First-party tiles use {@link OsAppIcon}. */
  iconUrl?: string;
}

/**
 * Which launcher app is "here" for the current route.
 * Boost lives on the owner face, not as a launcher tile.
 * Hubs covers `/apps`. Drop pages under `/collection` are Drops.
 */
export function resolveActiveOsAppId(
  pathname: string,
  viewerAccountId?: string | null
): string | null {
  const path = pathname.split(/[?#]/)[0] ?? pathname;

  if (path === APP_HOME_PATH || path.startsWith(`${APP_HOME_PATH}/`)) {
    return 'home';
  }
  if (
    path === APP_NOTIFICATIONS_PATH ||
    path.startsWith(`${APP_NOTIFICATIONS_PATH}/`)
  ) {
    return 'activity';
  }
  if (path === APP_MESSAGES_PATH || path.startsWith(`${APP_MESSAGES_PATH}/`)) {
    return 'messages';
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
    return 'drops';
  }
  if (path === APP_MARKET_CREATE_PATH) {
    return 'drops';
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
  if (path === APP_PROTOCOL_PATH || path.startsWith(`${APP_PROTOCOL_PATH}/`)) {
    return 'daos';
  }

  const portfolio = path.match(/^\/@([^/]+)(?:\/([^/]+))?/);
  if (!portfolio?.[1]) return null;

  const accountId = decodeURIComponent(portfolio[1]);
  const panel = portfolio[2] ?? null;

  if (panel === 'discover') return 'discover';
  if (panel === 'feed') return 'home';
  if (panel === 'collectibles') return 'collectibles';

  const accountLower = accountId.trim().toLowerCase();
  if (
    !panel &&
    (accountLower === GOVERNANCE_DAO_ACCOUNT.trim().toLowerCase() ||
      accountLower === TREASURY_DAO_ACCOUNT.trim().toLowerCase())
  ) {
    return 'daos';
  }
  if (!panel && isHeuristicDaoAccountId(accountLower)) {
    return 'daos';
  }

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

export function osAppOpensWithWallet(app: OsAppLink): boolean {
  return app.kind === 'open-page';
}

const PAGE_APP: OsAppLink = {
  id: 'page',
  label: 'Page',
  kind: 'open-page',
};

/** People, then what you trade, then where you belong. Page is last when signed in. */
function launcherApps(options: {
  discoverHref: string;
  collectiblesHref?: string;
  page?: boolean;
}): OsAppLink[] {
  const apps: OsAppLink[] = [
    { id: 'home', label: 'Home', kind: 'app', href: APP_HOME_PATH },
    {
      id: 'activity',
      label: 'Activity',
      kind: 'app',
      href: APP_NOTIFICATIONS_PATH,
    },
    {
      id: 'messages',
      label: 'Messages',
      kind: 'app',
      href: APP_MESSAGES_PATH,
    },
    { id: 'discover', label: 'Discover', kind: 'app', href: options.discoverHref },
    { id: 'market', label: 'Market', kind: 'app', href: APP_MARKET_PATH },
    { id: 'drops', label: 'Drops', kind: 'app', href: APP_DROPS_PATH },
  ];
  if (options.collectiblesHref) {
    apps.push({
      id: 'collectibles',
      label: 'Collectibles',
      kind: 'app',
      href: options.collectiblesHref,
    });
  }
  apps.push(
    { id: 'groups', label: 'Guilds', kind: 'app', href: APP_GROUPS_PATH },
    { id: 'hubs', label: 'Hubs', kind: 'app', href: APP_APPS_PATH },
    { id: 'daos', label: 'DAOs', kind: 'app', href: APP_DAOS_PATH }
  );
  if (options.page) apps.push(PAGE_APP);
  return apps;
}

export function gateOsApps(): OsAppLink[] {
  return launcherApps({
    discoverHref: APP_DISCOVER_PATH,
    collectiblesHref: APP_COLLECTIBLES_PATH,
  });
}

export function ownerPortfolioOsApps(accountId: string): OsAppLink[] {
  return launcherApps({
    discoverHref: discoverPath(accountId),
    collectiblesHref: portfolioCollectiblesPath(accountId),
    page: true,
  });
}

export function visitorPortfolioOsApps(accountId: string): OsAppLink[] {
  return launcherApps({
    discoverHref: discoverPath(accountId),
  });
}

export function appShellOsApps(accountId: string | null): OsAppLink[] {
  return launcherApps({
    discoverHref: APP_DISCOVER_PATH,
    collectiblesHref: accountId
      ? portfolioCollectiblesPath(accountId)
      : APP_COLLECTIBLES_PATH,
    page: Boolean(accountId),
  });
}
