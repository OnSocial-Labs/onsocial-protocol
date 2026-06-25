export const APP_HOME_PATH = '/home';
export const APP_DISCOVER_PATH = '/discover';
export const APP_GROUPS_PATH = '/groups';
export const APP_MARKET_PATH = '/market';

export function isAppRoutePath(pathname: string): boolean {
  return (
    pathname === APP_HOME_PATH ||
    pathname.startsWith(`${APP_HOME_PATH}/`) ||
    pathname === APP_DISCOVER_PATH ||
    pathname.startsWith(`${APP_DISCOVER_PATH}/`) ||
    pathname === APP_GROUPS_PATH ||
    pathname.startsWith(`${APP_GROUPS_PATH}/`) ||
    pathname === APP_MARKET_PATH ||
    pathname.startsWith(`${APP_MARKET_PATH}/`)
  );
}
