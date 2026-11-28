import { describe, expect, it } from 'vitest';
import {
  claimDockBackTop,
  claimDockScrollRootStack,
  popDockBackStack,
  popDockScrollRootStack,
  replaceDockScrollRootStack,
  resolveDockBackVisible,
  resolveDockConnectHintVisible,
  topDockBack,
  topDockScrollRoot,
  upsertDockBackStack,
  type DockBackStackItem,
  type DockScrollRootItem,
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

describe('dock scroll root stack', () => {
  const pageEl = { name: 'page' } as unknown as Element;
  const dropEl = { name: 'drop' } as unknown as Element;
  const readEl = { name: 'read' } as unknown as Element;
  const page: DockScrollRootItem = {
    id: 'page',
    element: pageEl,
    overlay: false,
  };
  const drop: DockScrollRootItem = {
    id: 'drop',
    element: dropEl,
    overlay: true,
  };
  const read: DockScrollRootItem = {
    id: 'read',
    element: readEl,
    overlay: true,
  };

  it('keeps the top overlay above a page that remounts', () => {
    const withDrop = claimDockScrollRootStack([page], drop);
    expect(topDockScrollRoot(withDrop)).toBe(dropEl);
    const remounted = claimDockScrollRootStack(withDrop, {
      ...page,
      id: 'page-2',
      element: { name: 'page-2' } as unknown as Element,
    });
    expect(topDockScrollRoot(remounted)).toBe(dropEl);
    expect(remounted.map((row) => row.id)).toEqual(['page', 'page-2', 'drop']);
  });

  it('follows Read over a drop, then the drop when Read closes', () => {
    const open = claimDockScrollRootStack(
      claimDockScrollRootStack([page], drop),
      read
    );
    expect(topDockScrollRoot(open)).toBe(readEl);
    const closed = popDockScrollRootStack(open, 'read');
    expect(topDockScrollRoot(closed)).toBe(dropEl);
  });

  it('updates the element without jumping a covered screen to the top', () => {
    const open = claimDockScrollRootStack(
      claimDockScrollRootStack([page], drop),
      read
    );
    const nextDrop = { name: 'drop-2' } as unknown as Element;
    const replaced = replaceDockScrollRootStack(open, {
      ...drop,
      element: nextDrop,
    });
    expect(topDockScrollRoot(replaced)).toBe(readEl);
    expect(replaced.find((row) => row.id === 'drop')?.element).toBe(nextDrop);
    expect(replaceDockScrollRootStack(replaced, { ...read })).toBe(replaced);
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
