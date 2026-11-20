import { describe, expect, it } from 'vitest';
import {
  claimOlderMessagesLoad,
  releaseOlderMessagesLoad,
} from '@/features/messages/messages-older-load';

describe('older messages pagination guard', () => {
  it('lets the first call own the page and blocks a second call until release', () => {
    const inflight = { current: false };
    expect(claimOlderMessagesLoad(inflight)).toBe(true);
    expect(inflight.current).toBe(true);
    expect(claimOlderMessagesLoad(inflight)).toBe(false);
    releaseOlderMessagesLoad(inflight);
    expect(inflight.current).toBe(false);
    expect(claimOlderMessagesLoad(inflight)).toBe(true);
  });

  it('does not depend on a render snapshot of the loading flag', () => {
    const inflight = { current: false };
    const staleLoadingOlder = false;
    expect(claimOlderMessagesLoad(inflight)).toBe(true);
    expect(staleLoadingOlder).toBe(false);
    expect(claimOlderMessagesLoad(inflight)).toBe(false);
  });
});
