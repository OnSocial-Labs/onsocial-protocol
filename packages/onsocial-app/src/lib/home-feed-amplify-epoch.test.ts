import { describe, expect, it, vi } from 'vitest';
import {
  getLastAmplifyAuthorId,
  getViewerAmplifyEpoch,
  recordViewerAmplifyConfirmed,
  subscribeViewerAmplifyConfirmed,
} from '@/lib/home-feed-amplify-epoch';

describe('viewer amplify epoch', () => {
  it('increments on each confirmed amplify and notifies listeners', () => {
    const before = getViewerAmplifyEpoch();
    const listener = vi.fn();
    const unsubscribe = subscribeViewerAmplifyConfirmed(listener);

    recordViewerAmplifyConfirmed('alice.near');
    expect(getViewerAmplifyEpoch()).toBe(before + 1);
    expect(getLastAmplifyAuthorId()).toBe('alice.near');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith({ authorId: 'alice.near' });

    recordViewerAmplifyConfirmed();
    expect(getViewerAmplifyEpoch()).toBe(before + 2);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    recordViewerAmplifyConfirmed();
    expect(getViewerAmplifyEpoch()).toBe(before + 3);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps separate listeners independent', () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = subscribeViewerAmplifyConfirmed(first);
    const offSecond = subscribeViewerAmplifyConfirmed(second);

    recordViewerAmplifyConfirmed();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    offFirst();
    recordViewerAmplifyConfirmed();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    offSecond();
  });
});
