/** Keep in sync with Playwright `waitForPortfolioClientReady`. */
export const E2E_PORTFOLIO_READY_ATTR = 'portfolioClientReady';

export const E2E_APP_ROUTER_PUSH_KEY = '__onsocialE2ePush';

let readyHolders = 0;

declare global {
  interface Window {
    __onsocialE2ePush?: (href: string) => void;
  }
}

export function markPortfolioClientReady(): void {
  if (typeof document === 'undefined') return;
  readyHolders += 1;
  document.body.dataset[E2E_PORTFOLIO_READY_ATTR] = 'true';
}

export function unmarkPortfolioClientReady(): void {
  if (typeof document === 'undefined') return;
  readyHolders = Math.max(0, readyHolders - 1);
  if (readyHolders === 0) {
    delete document.body.dataset[E2E_PORTFOLIO_READY_ATTR];
  }
}

export function readPortfolioClientReady(): boolean {
  if (typeof document === 'undefined') return false;
  return document.body.dataset[E2E_PORTFOLIO_READY_ATTR] === 'true';
}

export function installE2eAppRouterPush(
  push: (href: string) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.__onsocialE2ePush = push;
  return () => {
    if (window.__onsocialE2ePush === push) {
      delete window.__onsocialE2ePush;
    }
  };
}
