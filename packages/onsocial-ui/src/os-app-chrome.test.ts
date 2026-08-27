import { describe, expect, it } from 'vitest';
import {
  OsAppChromeNavSearch,
  OsAppChromePage,
  OsAppChromePageStatus,
  OsAppChromeScroller,
  OsAppChromeToolbarRail,
  osAppChromeNavSearchClassName,
  osAppChromePageClassName,
  osAppChromePageStatusClassName,
  osAppChromePanelFlushClassName,
  osAppChromeRailClassName,
  osAppChromeScrollerBleedClassName,
  osAppChromeScrollerClassName,
  osAppChromeScrollerInsetClassName,
} from './os-app-chrome.js';

describe('os-app-chrome', () => {
  it('exports shared chrome class names', () => {
    expect(osAppChromeScrollerClassName).toBe('os-app-chrome-scroller');
    expect(osAppChromeScrollerBleedClassName).toBe(
      'os-app-chrome-scroller-bleed'
    );
    expect(osAppChromeScrollerInsetClassName).toBe(
      'os-app-chrome-scroller-inset'
    );
    expect(osAppChromePanelFlushClassName).toBe('os-app-chrome-panel-flush');
    expect(osAppChromePageClassName).toBe('os-app-chrome-page');
    expect(osAppChromePageStatusClassName).toBe('os-app-chrome-page-status');
    expect(osAppChromeNavSearchClassName).toBe('os-app-chrome-nav-search');
    expect(osAppChromeRailClassName).toBe('os-app-chrome-rail');
    expect(typeof OsAppChromeNavSearch).toBe('function');
    expect(typeof OsAppChromeToolbarRail).toBe('function');
    expect(typeof OsAppChromeScroller).toBe('function');
    expect(typeof OsAppChromePage).toBe('function');
    expect(typeof OsAppChromePageStatus).toBe('function');
  });
});
