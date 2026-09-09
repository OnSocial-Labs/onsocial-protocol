import { osAppChromePageClassName } from '@onsocial/ui';

/**
 * Standard OsAppScreen page root. Inset is `.os-app-chrome-page` →
 * `--os-screen-body-inset`. Feature classes add layout only — never padding.
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

/** Market index, series/drop/hub error shells, series loading. */
export const MARKET_PAGE_CLASS = osChromePageClassName('market-page');

export const MARKET_INDEX_PAGE_CLASS = MARKET_PAGE_CLASS;

export const VAULT_PAGE_CLASS = osChromePageClassName(
  'market-page',
  'collectibles-page'
);

export const DOOR_PAGE_CLASS = osChromePageClassName(
  'market-page',
  'ticket-door-page'
);

export const PLAY_LOADING_PAGE_CLASS = osChromePageClassName(
  'market-page',
  'collectibles-play-page',
  'is-immersive'
);

export const GUILDS_PAGE_CLASS = osChromePageClassName('guilds-page');

export const DROP_STUDIO_PAGE_CLASS = osChromePageClassName('drop-studio');

export const HUB_PAGE_SKELETON_CLASS = osChromePageClassName(
  'app-page',
  'hub-page--skeleton'
);

export const COLLECTION_PAGE_SKELETON_CLASS = osChromePageClassName(
  'collection-page',
  'collection-page--skeleton'
);
