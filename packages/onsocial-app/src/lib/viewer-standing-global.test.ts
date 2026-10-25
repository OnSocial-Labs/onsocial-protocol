import { describe, expect, it, vi } from 'vitest';
import {
  getViewerStandEpoch,
  recordViewerStandConfirmed,
  subscribeViewerStandConfirmed,
} from '@/lib/viewer-standing-global';

describe('viewer stand epoch', () => {
  it('increments on each confirmed stand and notifies listeners', () => {
    const before = getViewerStandEpoch();
    const listener = vi.fn();
    const unsubscribe = subscribeViewerStandConfirmed(listener);

    recordViewerStandConfirmed();
    expect(getViewerStandEpoch()).toBe(before + 1);
    expect(listener).toHaveBeenCalledTimes(1);

    recordViewerStandConfirmed();
    expect(getViewerStandEpoch()).toBe(before + 2);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    recordViewerStandConfirmed();
    expect(getViewerStandEpoch()).toBe(before + 3);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps separate listeners independent', () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = subscribeViewerStandConfirmed(first);
    const offSecond = subscribeViewerStandConfirmed(second);

    recordViewerStandConfirmed();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    offFirst();
    recordViewerStandConfirmed();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    offSecond();
  });
});
