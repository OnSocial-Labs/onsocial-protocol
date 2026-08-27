/** Compact OsAppScreen nav band height (pairs with app `compactChrome`). */
export const osAppChromeNavHeightClassName = 'os-app-chrome-heading-slot';

/** Nested list/thread scroller under glass header (edge rail + frost). */
export const osAppChromeScrollerClassName = 'os-app-chrome-scroller';

export const osAppChromeScrollerBleedClassName = 'os-app-chrome-scroller-bleed';

export const osAppChromeScrollerInsetClassName = 'os-app-chrome-scroller-inset';

/** Panel root flush horizontal — inset lives on `.os-app-chrome-scroller-inset`. */
export const osAppChromePanelFlushClassName = 'os-app-chrome-panel-flush';

export {
  OsAppChromeNavSearch,
  osAppChromeNavSearchClassName,
  osAppChromeNavSearchIdleClassName,
} from './os-app-chrome-nav-search.js';

export { OsAppChromeScroller } from './os-app-chrome-scroller.js';

export {
  OsAppChromeToolbarRail,
  osAppChromeRailClassName,
} from './os-app-chrome-toolbar-rail.js';

export {
  OsAppChromePage,
  OsAppChromePageStatus,
  osAppChromePageClassName,
  osAppChromePageStatusClassName,
} from './os-app-chrome-page.js';
