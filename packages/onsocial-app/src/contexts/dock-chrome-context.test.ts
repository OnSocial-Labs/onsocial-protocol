import { describe, expect, it } from 'vitest';
import {
  claimDockBackTop,
  popDockBackStack,
  resolveDockBackVisible,
  resolveDockConnectHintVisible,
  topDockBack,
  upsertDockBackStack,
  type DockBackStackItem,
} from '@/contexts/dock-chrome-context';

describe('resolveDockBackVisible', () => {
  it('shows dock back when registered and idle', () => {
    expect(
      resolveDockBackVisible({
        dockBack: { fallbackHref: '/home' },
        launcherOpen: false,
      })
    ).toBe(true);
  });

  it('hides dock back while the launcher is open', () => {
    expect(
      resolveDockBackVisible({
        dockBack: { fallbackHref: '/home' },
        launcherOpen: true,
      })
    ).toBe(false);
  });
});

describe('dock back stack', () => {
  const page: DockBackStackItem = {
    id: 'page',
    entry: { fallbackHref: '/market', ariaLabel: 'Back' },
  };
  const sheet: DockBackStackItem = {
    id: 'sheet',
    entry: { fallbackHref: '/collection/night', ariaLabel: 'Back' },
  };

  it('shows the latest registration and restores the page on pop', () => {
    const stacked = upsertDockBackStack([page], sheet);
    expect(topDockBack(stacked)?.fallbackHref).toBe('/collection/night');
    expect(topDockBack(popDockBackStack(stacked, 'sheet'))?.fallbackHref).toBe(
      '/market'
    );
    const updated = upsertDockBackStack(stacked, {
      ...page,
      entry: { fallbackHref: '/market', ariaLabel: 'Leave' },
    });
    expect(topDockBack(updated)?.fallbackHref).toBe('/collection/night');
    const claimed = claimDockBackTop(
      [...updated, { id: 'page-2', entry: { fallbackHref: '/home' } }],
      sheet
    );
    expect(topDockBack(claimed)?.fallbackHref).toBe('/collection/night');
    expect(claimed.map((row) => row.id)).toEqual(['page', 'page-2', 'sheet']);
    expect(topDockBack(popDockBackStack([page], 'page'))).toBeNull();
  });
});

describe('resolveDockConnectHintVisible', () => {
  it('shows the dock hint only when disconnected and the header does not own Connect', () => {
    expect(
      resolveDockConnectHintVisible({
        headerOwnsConnect: false,
        isConnected: false,
      })
    ).toBe(true);
    expect(
      resolveDockConnectHintVisible({
        headerOwnsConnect: true,
        isConnected: false,
      })
    ).toBe(false);
    expect(
      resolveDockConnectHintVisible({
        headerOwnsConnect: false,
        isConnected: true,
      })
    ).toBe(false);
  });
});
