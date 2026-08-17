/**
 * Shared Playwright helpers for @onsocial/app e2e smokes.
 * App-local only — not part of @onsocial/ui.
 */
export {
  E2E_CHROME_TIMEOUT_MS,
  expectPortfolioIdentityOrSkip,
  expectStandingPageOrSkip,
  gotoApp,
  waitForPortfolioClientReady,
} from './navigation';
export {
  clickTab,
  clickTabAndWaitUrl,
  expectTabSelected,
  expectTabVisible,
  tab,
  tablist,
} from './tabs';
