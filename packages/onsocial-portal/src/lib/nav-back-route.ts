export interface RouteNavBackState {
  label: string;
}

const DEFAULT_NAV_BACK: RouteNavBackState = { label: 'Back' };

/** Synchronous back-button hint for routes that swap logo → back on mobile. */
export function resolveRouteNavBack(pathname: string): RouteNavBackState | null {
  if (pathname === '/' || pathname === '/offline') return null;

  if (
    pathname.startsWith('/u/') ||
    pathname === '/discover'
  ) {
    return DEFAULT_NAV_BACK;
  }

  if (/^\/sdk\/[^/]+/.test(pathname)) {
    return { label: 'SDK' };
  }

  if (
    pathname.startsWith('/governance/') ||
    pathname.startsWith('/onapi/') ||
    pathname.startsWith('/boost/') ||
    pathname.startsWith('/ops/')
  ) {
    return DEFAULT_NAV_BACK;
  }

  return null;
}
