import { describe, expect, it, vi } from 'vitest';
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
    vi.unstubAllGlobals();
    vi.resetModules();
  });
});
