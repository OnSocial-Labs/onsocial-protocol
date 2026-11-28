import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginHistoryBack,
  inFlightPopRepair,
  placeHistoryOpForTrail,
  repairClosingLayerHistory,
  withoutClosingLayer,
} from '@/lib/place-history';

const QUOTES = '/alice.near/post/1/quotes?tab=reposts';
const DROP = '/collection/night-roads?t=7';

describe('place history trail op', () => {
  it('pushes when the mounted stack grows', () => {
    expect(
      placeHistoryOpForTrail({
        prevLength: 0,
        nextLength: 1,
        parentChanged: false,
      })
    ).toBe('push');
    expect(
      placeHistoryOpForTrail({
        prevLength: 1,
        nextLength: 2,
        parentChanged: false,
      })
    ).toBe('push');
  });

  it('slides when a third open drops the grandparent', () => {
    expect(
      placeHistoryOpForTrail({
        prevLength: 2,
        nextLength: 2,
        parentChanged: true,
      })
    ).toBe('slide');
  });

  it('replaces when the same screen only changes URL', () => {
    expect(
      placeHistoryOpForTrail({
        prevLength: 1,
        nextLength: 1,
        parentChanged: false,
      })
    ).toBe('replace');
  });
});

describe('overlay history after a closing layer', () => {
  it('pushes a fresh entry when Back has already popped the overlay', () => {
    const live = withoutClosingLayer(
      [{ id: 'post-a' }, { id: 'post-b' }],
      'post-b'
    );
    expect(live.map((entry) => entry.id)).toEqual(['post-a']);
    expect(
      repairClosingLayerHistory({
        canonical: QUOTES,
        currentUrl: '/home',
        historyHasLayer: false,
      })
    ).toEqual({ op: 'push', href: QUOTES });
  });

  it('replaces the entry while the pop is still queued, then pushes the canonical with its query', () => {
    const replaced = repairClosingLayerHistory({
      canonical: DROP,
      currentUrl: '/alice.near/post/1',
      historyHasLayer: true,
    });
    expect(replaced).toEqual({ op: 'replace', href: DROP });

    const popped = inFlightPopRepair({
      pendingClosePop: true,
      closingId: null,
      stackLength: 1,
      historyHasLayer: false,
      canonical: DROP,
    });
    expect(popped).toEqual({ swallow: true, pushHref: DROP });
    expect(popped.pushHref).toContain('?t=7');
  });

  it('drops the closing post before quotes so it does not stay under the new layer', () => {
    const closing = { id: 'post-a', kind: 'post' as const };
    const live = withoutClosingLayer([closing], closing.id);
    expect(live).toEqual([]);
    expect(
      repairClosingLayerHistory({
        canonical: QUOTES,
        currentUrl: '/home',
        historyHasLayer: false,
      }).href
    ).toBe(QUOTES);
  });

  it('drops the closing post before a drop and keeps the edition query', () => {
    const live = withoutClosingLayer([{ id: 'post-a' }], 'post-a');
    expect(live).toEqual([]);
    expect(
      repairClosingLayerHistory({
        canonical: DROP,
        currentUrl: '/home',
        historyHasLayer: false,
      })
    ).toEqual({ op: 'push', href: DROP });
  });

  it('does not arm a pending pop when Back runs at depth 0', () => {
    const step = beginHistoryBack({ depth: 0, historyHasLayer: true });
    expect(step).toEqual({ back: true, armPending: false });

    const pending = step.armPending;
    const later = inFlightPopRepair({
      pendingClosePop: pending,
      closingId: null,
      stackLength: 1,
      historyHasLayer: true,
      canonical: '/alice.near/post/2',
    });
    expect(later.swallow).toBe(false);
  });

  it('arms the pending pop when Back will reach the guard', () => {
    expect(beginHistoryBack({ depth: 1, historyHasLayer: true })).toEqual({
      back: true,
      armPending: true,
    });
    expect(beginHistoryBack({ depth: 2, historyHasLayer: true })).toEqual({
      back: true,
      armPending: true,
    });
    expect(beginHistoryBack({ depth: 1, historyHasLayer: false })).toEqual({
      back: false,
      armPending: false,
    });
  });
});

describe('in-flight history rewrite', () => {
  it('keeps one go when a second align lands before the pop', async () => {
    vi.resetModules();
    const go = vi.fn();
    const listeners: EventListener[] = [];
    vi.stubGlobal('History', {
      prototype: { pushState: vi.fn(), replaceState: vi.fn() },
    });
    vi.stubGlobal('window', {
      location: { pathname: '/@b.near/posts/2', search: '' },
      history: {
        state: {
          __NA: true,
          onsocialPostLayer: true,
          onsocialPostLayerDepth: 2,
        },
        go,
        back: vi.fn(),
        pushState: vi.fn(),
        replaceState: vi.fn(),
      },
      addEventListener: (type: string, listener: EventListener) => {
        if (type === 'popstate') listeners.push(listener);
      },
    });

    const { alignPlaceHistory, getPlaceHistoryGuard } = await import(
      '@/lib/place-history'
    );
    const guard = getPlaceHistoryGuard();
    guard.depth = 2;
    alignPlaceHistory(1, '/collection/one');
    alignPlaceHistory(1, '/collection/two');

    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(-1);
    expect(guard.suppressPops).toBe(1);

    listeners[0]?.(new Event('popstate'));
    expect(guard.suppressPops).toBe(0);
    expect(guard.depth).toBe(1);

    const onPop = vi.fn();
    guard.onPop = onPop;
    guard.depth = 1;
    listeners[0]?.(new Event('popstate'));
    expect(onPop).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('issues the rest of a longer jump after the shorter one lands', async () => {
    vi.resetModules();
    const go = vi.fn();
    const protoPush = vi.fn();
    const protoReplace = vi.fn();
    const listeners: EventListener[] = [];
    vi.stubGlobal('History', {
      prototype: { pushState: protoPush, replaceState: protoReplace },
    });
    vi.stubGlobal('window', {
      location: { pathname: '/@b.near/posts/2', search: '' },
      history: {
        state: {
          __NA: true,
          onsocialPostLayer: true,
          onsocialPostLayerDepth: 2,
        },
        go,
        back: vi.fn(),
        pushState: vi.fn(),
        replaceState: vi.fn(),
      },
      addEventListener: (type: string, listener: EventListener) => {
        if (type === 'popstate') listeners.push(listener);
      },
    });

    const { alignPlaceHistory, getPlaceHistoryGuard, slidePlaceHistory } =
      await import('@/lib/place-history');
    const guard = getPlaceHistoryGuard();
    guard.depth = 2;
    slidePlaceHistory('/post-a', '/post-c');
    alignPlaceHistory(0, '/home');

    expect(go.mock.calls).toEqual([[-1]]);
    expect(protoPush).not.toHaveBeenCalled();
    expect(protoReplace).not.toHaveBeenCalled();

    listeners[0]?.(new Event('popstate'));
    expect(go.mock.calls).toEqual([[-1], [-1]]);
    expect(protoPush).not.toHaveBeenCalled();
    expect(protoReplace).not.toHaveBeenCalled();

    listeners[0]?.(new Event('popstate'));
    expect(go).toHaveBeenCalledTimes(2);
    expect(guard.depth).toBe(0);
    expect(guard.suppressPops).toBe(0);
    expect(protoPush).not.toHaveBeenCalled();
    expect(protoReplace).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('queues a push until the longer jump lands', async () => {
    vi.resetModules();
    const go = vi.fn();
    const protoPush = vi.fn();
    const protoReplace = vi.fn();
    const listeners: EventListener[] = [];
    vi.stubGlobal('History', {
      prototype: { pushState: protoPush, replaceState: protoReplace },
    });
    vi.stubGlobal('window', {
      location: { pathname: '/@b.near/posts/2', search: '' },
      history: {
        state: {
          __NA: true,
          onsocialPostLayer: true,
          onsocialPostLayerDepth: 2,
        },
        go,
        back: vi.fn(),
        pushState: vi.fn(),
        replaceState: vi.fn(),
      },
      addEventListener: (type: string, listener: EventListener) => {
        if (type === 'popstate') listeners.push(listener);
      },
    });

    const {
      alignPlaceHistory,
      getPlaceHistoryGuard,
      pushPlaceLayer,
      slidePlaceHistory,
    } = await import('@/lib/place-history');
    const guard = getPlaceHistoryGuard();
    guard.depth = 2;
    slidePlaceHistory('/post-a', '/post-c');
    pushPlaceLayer('/post-new');
    alignPlaceHistory(0, '/home');

    expect(protoPush).not.toHaveBeenCalled();
    listeners[0]?.(new Event('popstate'));
    expect(protoPush).not.toHaveBeenCalled();
    expect(go.mock.calls).toEqual([[-1], [-1]]);

    listeners[0]?.(new Event('popstate'));
    expect(protoPush).toHaveBeenCalledTimes(1);
    expect(protoPush.mock.calls[0]?.[2]).toBe('/post-new');
    expect(
      (protoPush.mock.calls[0]?.[0] as { onsocialPostLayerDepth?: number })
        .onsocialPostLayerDepth
    ).toBe(1);
    expect(guard.depth).toBe(1);
    expect(guard.suppressPops).toBe(0);

    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('queues a replace until the in-flight jump lands', async () => {
    vi.resetModules();
    const order: string[] = [];
    const protoPush = vi.fn(() => {
      order.push('push');
    });
    const protoReplace = vi.fn(
      (
        state: { onsocialPostLayerDepth?: number },
        _title: string,
        url: string
      ) => {
        order.push(`replace:${url}:${state.onsocialPostLayerDepth}`);
      }
    );
    const listeners: EventListener[] = [];
    vi.stubGlobal('History', {
      prototype: { pushState: protoPush, replaceState: protoReplace },
    });
    vi.stubGlobal('window', {
      location: { pathname: '/@b.near/posts/2', search: '' },
      history: {
        state: {
          __NA: true,
          onsocialPostLayer: true,
          onsocialPostLayerDepth: 2,
        },
        go: vi.fn(),
        back: vi.fn(),
        pushState: vi.fn(),
        replaceState: vi.fn(),
      },
      addEventListener: (type: string, listener: EventListener) => {
        if (type === 'popstate') listeners.push(listener);
      },
    });

    const { alignPlaceHistory, getPlaceHistoryGuard, replacePlaceLayer } =
      await import('@/lib/place-history');
    const guard = getPlaceHistoryGuard();
    guard.depth = 2;
    alignPlaceHistory(1, '/post-a');
    replacePlaceLayer('/post-b');
    expect(order).toEqual([]);

    listeners[0]?.(new Event('popstate'));
    expect(order).toEqual(['replace:/post-a:1', 'replace:/post-b:1']);
    expect(protoPush).not.toHaveBeenCalled();
    expect(guard.depth).toBe(1);

    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('does not go past a one-entry session', async () => {
    vi.resetModules();
    const go = vi.fn();
    vi.stubGlobal('History', {
      prototype: { pushState: vi.fn(), replaceState: vi.fn() },
    });
    vi.stubGlobal('window', {
      location: { pathname: '/collection/night-drive', search: '' },
      history: {
        length: 1,
        state: {
          __NA: true,
          onsocialPostLayer: true,
          onsocialPostLayerDepth: 3,
        },
        go,
        back: vi.fn(),
        pushState: vi.fn(),
        replaceState: vi.fn(),
      },
      addEventListener: vi.fn(),
    });

    const { alignPlaceHistory, getPlaceHistoryGuard } = await import(
      '@/lib/place-history'
    );
    const guard = getPlaceHistoryGuard();
    guard.depth = 3;
    alignPlaceHistory(0, '/home');

    expect(go).not.toHaveBeenCalled();
    expect(guard.suppressPops).toBe(0);
    expect(guard.depth).toBe(0);

    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('releases a jump that never pops and then runs the queued write', async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const go = vi.fn();
    const protoPush = vi.fn();
    const listeners: EventListener[] = [];
    vi.stubGlobal('History', {
      prototype: { pushState: protoPush, replaceState: vi.fn() },
    });
    vi.stubGlobal('window', {
      location: { pathname: '/@b.near/posts/2', search: '' },
      history: {
        state: {
          __NA: true,
          onsocialPostLayer: true,
          onsocialPostLayerDepth: 2,
        },
        go,
        back: vi.fn(),
        pushState: vi.fn(),
        replaceState: vi.fn(),
      },
      addEventListener: (type: string, listener: EventListener) => {
        if (type === 'popstate') listeners.push(listener);
      },
    });

    try {
      const {
        PLACE_HISTORY_JUMP_TIMEOUT_MS,
        alignPlaceHistory,
        getPlaceHistoryGuard,
        pushPlaceLayerAt,
      } = await import('@/lib/place-history');
      const guard = getPlaceHistoryGuard();
      guard.depth = 2;
      alignPlaceHistory(1, '/post-a');
      pushPlaceLayerAt('/post-new', 2);

      expect(go).toHaveBeenCalledTimes(1);
      expect(protoPush).not.toHaveBeenCalled();
      expect(guard.suppressPops).toBe(1);

      vi.advanceTimersByTime(PLACE_HISTORY_JUMP_TIMEOUT_MS);

      expect(guard.suppressPops).toBe(0);
      expect(protoPush).toHaveBeenCalledTimes(1);
      expect(protoPush.mock.calls[0]?.[2]).toBe('/post-new');
      const onPop = vi.fn();
      guard.onPop = onPop;
      listeners[0]?.(new Event('popstate'));
      expect(onPop).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});

describe('in-app place back', () => {
  it('follows closeTop instead of history depth', async () => {
    vi.resetModules();
    vi.stubGlobal('window', {
      history: { state: null },
      addEventListener: vi.fn(),
    });
    const { closePlaceLayerIfOpen, getPlaceHistoryGuard } = await import(
      '@/lib/place-history'
    );
    const guard = getPlaceHistoryGuard();
    guard.depth = 3;
    guard.closeTop = () => false;
    expect(closePlaceLayerIfOpen()).toBe(false);
    guard.depth = 0;
    guard.closeTop = () => true;
    expect(closePlaceLayerIfOpen()).toBe(true);
    vi.unstubAllGlobals();
    vi.resetModules();
  });
});

describe('native place push bypasses patched history', () => {
  it('calls History.prototype.pushState, not window.history.pushState', async () => {
    vi.resetModules();
    const protoPush = vi.fn();
    const instancePush = vi.fn();
    const history = {
      state: { __NA: true },
      pushState: instancePush,
      replaceState: vi.fn(),
      back: vi.fn(),
      go: vi.fn(),
    };
    vi.stubGlobal('History', {
      prototype: { pushState: protoPush, replaceState: vi.fn() },
    });
    vi.stubGlobal('window', {
      location: { pathname: '/home', search: '' },
      history,
      addEventListener: vi.fn(),
    });
    const { pushPlaceLayer } = await import('@/lib/place-history');
    pushPlaceLayer('/@alice.near/posts/a');
    expect(protoPush).toHaveBeenCalledTimes(1);
    expect(instancePush).not.toHaveBeenCalled();
    const state = protoPush.mock.calls[0]?.[0] as {
      onsocialPostLayer?: boolean;
      onsocialPostLayerDepth?: number;
    };
    expect(state.onsocialPostLayer).toBe(true);
    expect(state.onsocialPostLayerDepth).toBe(1);
    expect(state).not.toHaveProperty('onsocialReadLayer');
    pushPlaceLayer('/home', { accountId: 'alice.near', postId: 'night' });
    const stamped = protoPush.mock.calls[1]?.[0] as {
      onsocialReadLayer?: { accountId?: string; postId?: string };
    };
    expect(stamped.onsocialReadLayer).toEqual({
      accountId: 'alice.near',
      postId: 'night',
    });
    vi.unstubAllGlobals();
    vi.resetModules();
  });
});

describe('read history recall and pop', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('does not treat the 50-entry history cap as the same read', async () => {
    vi.resetModules();
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
    vi.stubGlobal('window', {
      location: { pathname: '/home', search: '' },
      history: { length: 50, state: null },
      addEventListener: vi.fn(),
    });
    const { recallPlaceRead, rememberPlaceRead } = await import(
      '@/lib/place-history'
    );
    rememberPlaceRead('/home', { accountId: 'alice.near', postId: 'night' });
    expect(recallPlaceRead()).toBeNull();
    expect(store.size).toBe(0);
  });

  it('recalls a read when the history length still matches', async () => {
    vi.resetModules();
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
    vi.stubGlobal('window', {
      location: { pathname: '/home', search: '' },
      history: { length: 4, state: null },
      addEventListener: vi.fn(),
    });
    const { recallPlaceRead, rememberPlaceRead } = await import(
      '@/lib/place-history'
    );
    rememberPlaceRead('/home', { accountId: 'alice.near', postId: 'night' });
    expect(recallPlaceRead()).toEqual({
      href: '/home',
      stamp: { accountId: 'alice.near', postId: 'night' },
    });
  });

  it('pops a left read and pushes the page already on screen without the stamp', async () => {
    vi.resetModules();
    const back = vi.fn();
    const pushState = vi.fn();
    const replaceState = vi.fn();
    const location = { pathname: '/@alice.near', search: '' };
    vi.stubGlobal('History', {
      prototype: { pushState, replaceState },
    });
    vi.stubGlobal('window', {
      location,
      history: {
        state: {
          __NA: true,
          onsocialPostLayer: true,
          onsocialPostLayerDepth: 1,
          onsocialReadLayer: { accountId: 'alice.near', postId: 'night' },
        },
        back,
        pushState: vi.fn(),
        replaceState: vi.fn(),
        go: vi.fn(),
        length: 3,
      },
      addEventListener: vi.fn(),
      setTimeout: () => 1,
      clearTimeout: vi.fn(),
    });
    const { getPlaceHistoryGuard, retargetAfterReadLeave } = await import(
      '@/lib/place-history'
    );
    const guard = getPlaceHistoryGuard();
    guard.depth = 1;
    retargetAfterReadLeave('/home', '/@alice.near');
    expect(back).toHaveBeenCalledTimes(1);
    expect(guard.suppressPops).toBe(1);
    location.pathname = '/home';
    guard.afterJump?.();
    const replaced = replaceState.mock.calls[0]?.[0] as {
      onsocialReadLayer?: unknown;
      onsocialPostLayer?: unknown;
    };
    expect(replaced.onsocialReadLayer).toBeUndefined();
    expect(replaced.onsocialPostLayer).toBeUndefined();
    expect(replaceState.mock.calls[0]?.[2]).toBe('/home');
    const pushed = pushState.mock.calls[0]?.[0] as {
      onsocialReadLayer?: unknown;
    };
    expect(pushed.onsocialReadLayer).toBeUndefined();
    expect(pushState.mock.calls[0]?.[2]).toBe('/@alice.near');
    expect(guard.depth).toBe(0);
  });

  it('pops the read entry and holds the next push', async () => {
    vi.resetModules();
    const back = vi.fn();
    vi.stubGlobal('History', {
      prototype: { pushState: vi.fn(), replaceState: vi.fn() },
    });
    vi.stubGlobal('window', {
      location: { pathname: '/home', search: '' },
      history: {
        state: {
          __NA: true,
          onsocialPostLayer: true,
          onsocialPostLayerDepth: 1,
        },
        back,
        pushState: vi.fn(),
        replaceState: vi.fn(),
        go: vi.fn(),
        length: 2,
      },
      addEventListener: vi.fn(),
      setTimeout: () => 1,
      clearTimeout: vi.fn(),
    });
    const { getPlaceHistoryGuard, popPlaceLayerEntry } = await import(
      '@/lib/place-history'
    );
    popPlaceLayerEntry();
    expect(back).toHaveBeenCalledTimes(1);
    expect(getPlaceHistoryGuard().suppressPops).toBe(1);
  });
});
