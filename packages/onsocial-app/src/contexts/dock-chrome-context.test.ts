import { describe, expect, it } from 'vitest';
import { resolveDockBackVisible } from '@/contexts/dock-chrome-context';

describe('resolveDockBackVisible', () => {
  it('shows dock back when registered and idle', () => {
    expect(
      resolveDockBackVisible({
        dockBack: { fallbackHref: '/home' },
        launcherOpen: false,
        searchChromeActive: false,
      })
    ).toBe(true);
  });

  it('hides dock back while mobile header search is expanded', () => {
    expect(
      resolveDockBackVisible({
        dockBack: { fallbackHref: '/home' },
        launcherOpen: false,
        searchChromeActive: true,
      })
    ).toBe(false);
  });

  it('hides dock back while the launcher is open', () => {
    expect(
      resolveDockBackVisible({
        dockBack: { fallbackHref: '/home' },
        launcherOpen: true,
        searchChromeActive: false,
      })
    ).toBe(false);
  });
});
