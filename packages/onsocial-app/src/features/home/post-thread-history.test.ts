import { describe, expect, it } from 'vitest';
import {
  beginHistoryBack,
  inFlightPopRepair,
  repairClosingLayerHistory,
  shouldRestoreClosedDrop,
  withoutClosingLayer,
} from './post-thread-history';

const QUOTES = '/alice.near/post/1/quotes?tab=reposts';
const DROP = '/collection/night-roads?t=7';

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
    expect(beginHistoryBack({ depth: 1, historyHasLayer: false })).toEqual({
      back: false,
      armPending: false,
    });
  });

  it('restores a closed drop when Forward returns to its permalink', () => {
    expect(
      shouldRestoreClosedDrop({
        stackLength: 0,
        historyFlagged: true,
        locationHref: DROP,
        savedCanonical: DROP,
      })
    ).toBe(true);
    expect(
      shouldRestoreClosedDrop({
        stackLength: 1,
        historyFlagged: true,
        locationHref: DROP,
        savedCanonical: DROP,
      })
    ).toBe(false);
    expect(
      shouldRestoreClosedDrop({
        stackLength: 0,
        historyFlagged: true,
        locationHref: '/home',
        savedCanonical: DROP,
      })
    ).toBe(false);
  });
});
