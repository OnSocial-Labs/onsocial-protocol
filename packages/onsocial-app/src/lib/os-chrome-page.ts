import { osAppChromePageClassName } from '@onsocial/ui';

/**
 * Standard OsAppScreen page root. Inset is `.os-app-chrome-page` →
 * `--os-screen-body-inset`. Do not also list these roots on the globals
 * allowlist (that would double-pad).
 */
export function osChromePageClassName(
  ...parts: Array<string | false | null | undefined>
): string {
  return [osAppChromePageClassName, ...parts].filter(Boolean).join(' ');
}

export const LAUNCHER_HOME_PAGE_CLASS = osChromePageClassName('launcher-home');

export const DROPS_INDEX_PAGE_CLASS = osChromePageClassName(
  'market-page-body',
  'drops-page-body'
);

export const MARKET_INDEX_PAGE_CLASS = osChromePageClassName('market-page');
