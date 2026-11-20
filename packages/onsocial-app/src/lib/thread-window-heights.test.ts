import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearThreadWindowSizeCaches,
  threadWindowSizeCache,
} from './thread-window-heights';

describe('threadWindowSizeCache', () => {
  beforeEach(() => {
    clearThreadWindowSizeCaches();
  });

  it('reuses one cache per root path and touches LRU on read', () => {
    const a = threadWindowSizeCache('alice.near/post/1');
    a.set('alice.near:r1', 320);
    expect(threadWindowSizeCache('alice.near/post/1')).toBe(a);
    expect(threadWindowSizeCache('alice.near/post/1').get('alice.near:r1')).toBe(
      320
    );
  });

  it('evicts the oldest root once the cap is full', () => {
    for (let i = 0; i < 16; i += 1) {
      const cache = threadWindowSizeCache(`alice.near/post/p${i}`);
      cache.set(`alice.near:p${i}`, 200 + i);
    }
    expect(
      threadWindowSizeCache('alice.near/post/p0').get('alice.near:p0')
    ).toBeUndefined();
    expect(
      threadWindowSizeCache('alice.near/post/p15').get('alice.near:p15')
    ).toBe(215);
  });
});
