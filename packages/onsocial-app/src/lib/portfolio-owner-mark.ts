import { APP_WALLET_ACCOUNT_KEY } from '@/lib/gate-return';

/** Page account from `/@id` and `/@id/writing`. */
export function portfolioAccountFromPath(pathname: string): string {
  const match = /^\/@([^/]+)/.exec(pathname);
  if (!match?.[1]) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function isPortfolioOwner(
  pageAccountId: string,
  viewerId: string | null | undefined
): boolean {
  const page = pageAccountId.trim().toLowerCase();
  const viewer = viewerId?.trim().toLowerCase() ?? '';
  return Boolean(page && viewer && page === viewer);
}

/** Before paint, and again on client navigations. */
export function markPortfolioOwner(pathname: string): void {
  let viewer = '';
  try {
    viewer = window.localStorage.getItem(APP_WALLET_ACCOUNT_KEY) ?? '';
  } catch {
    viewer = '';
  }
  const owner = isPortfolioOwner(portfolioAccountFromPath(pathname), viewer);
  document.documentElement.setAttribute(
    'data-portfolio-owner',
    owner ? '1' : '0'
  );
}

export const portfolioOwnerScript = `(function(){
  var KEY=${JSON.stringify(APP_WALLET_ACCOUNT_KEY)};
  function pageAccount(){
    var match=location.pathname.match(/^\\/@([^/]+)/);
    if(!match) return '';
    try { return decodeURIComponent(match[1]); } catch (e) { return match[1]; }
  }
  function sync(){
    var viewer='';
    try { viewer=localStorage.getItem(KEY)||''; } catch (e) {}
    var page=pageAccount();
    var owner=viewer && page && viewer.toLowerCase()===page.toLowerCase();
    document.documentElement.setAttribute('data-portfolio-owner', owner ? '1' : '0');
  }
  sync();
  window.addEventListener('popstate', sync);
})();`;
