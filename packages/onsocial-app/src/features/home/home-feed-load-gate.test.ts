import { describe, expect, it } from 'vitest';
import {
  canRunHomeFeedReconcile,
  canStartHomeFeedAppend,
} from './home-feed-load-gate';

describe('canStartHomeFeedAppend', () => {
  it('allows append only when idle', () => {
    expect(
      canStartHomeFeedAppend({
        appendInFlight: false,
        isLoading: false,
        isRefreshing: false,
      })
    ).toBe(true);
  });

  it('blocks while append, load, or soft refresh is live', () => {
    expect(
      canStartHomeFeedAppend({
        appendInFlight: true,
        isLoading: false,
        isRefreshing: false,
      })
    ).toBe(false);
    expect(
      canStartHomeFeedAppend({
        appendInFlight: false,
        isLoading: true,
        isRefreshing: false,
      })
    ).toBe(false);
    expect(
      canStartHomeFeedAppend({
        appendInFlight: false,
        isLoading: false,
        isRefreshing: true,
      })
    ).toBe(false);
  });
});

describe('canRunHomeFeedReconcile', () => {
  it('runs only against a painted idle list', () => {
    expect(
      canRunHomeFeedReconcile({
        isLoading: false,
        isRefreshing: false,
        postCount: 3,
      })
    ).toBe(true);
    expect(
      canRunHomeFeedReconcile({
        isLoading: true,
        isRefreshing: false,
        postCount: 3,
      })
    ).toBe(false);
    expect(
      canRunHomeFeedReconcile({
        isLoading: false,
        isRefreshing: true,
        postCount: 3,
      })
    ).toBe(false);
    expect(
      canRunHomeFeedReconcile({
        isLoading: false,
        isRefreshing: false,
        postCount: 0,
      })
    ).toBe(false);
  });
});
