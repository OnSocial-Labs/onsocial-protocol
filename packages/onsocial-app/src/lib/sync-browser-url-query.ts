/** Build a same-origin path + optional query string. */
export function buildPathWithQuery(
  pathname: string,
  params: URLSearchParams
): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Update the address bar without a Next.js soft navigation.
 * Use for query-only sync on routes that also have intercepting overlays —
 * router.replace would reopen the glass panel over the full-page shell.
 */
export function replaceBrowserQueryUrl(
  pathname: string,
  params: URLSearchParams
): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const nextUrl = buildPathWithQuery(pathname, params);
  const currentUrl = `${pathname}${window.location.search}`;
  if (nextUrl === currentUrl) {
    return false;
  }

  window.history.replaceState(window.history.state, '', nextUrl);
  return true;
}

/**
 * Update pathname + query without a Next.js soft navigation.
 * Use on full-page routes with intercepting overlays (standing tab switches).
 */
export function replaceBrowserUrl(nextUrl: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl === currentUrl) {
    return false;
  }

  window.history.replaceState(window.history.state, '', nextUrl);
  return true;
}
