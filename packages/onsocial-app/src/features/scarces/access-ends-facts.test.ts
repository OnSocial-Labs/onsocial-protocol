import { describe, expect, it } from 'vitest';
import {
  accessEndsScheduleFacts,
  collectionShouldShowAccessEnds,
} from './access-ends-facts';

describe('accessEndsScheduleFacts', () => {
  it('formats future and past access ends', () => {
    const now = 1_700_000_000_000;
    const future = accessEndsScheduleFacts(now + 86_400_000, now);
    expect(future.empty).toBe(false);
    expect(future.ends).toBeTruthy();
    expect(future.next).toMatch(/^Ends /);

    const past = accessEndsScheduleFacts(now - 86_400_000, now);
    expect(past.empty).toBe(false);
    expect(past.next).toMatch(/^Ended /);
  });

  it('hides Access when Event already covers the story', () => {
    expect(
      collectionShouldShowAccessEnds(
        {
          accessEndsAtMs: 1_800_000_000_000,
          eventStartsAtMs: null,
          eventEndsAtMs: 1_800_000_000_000,
          place: null,
          kind: 'ticket',
        },
        Date.now()
      )
    ).toBe(false);

    expect(
      collectionShouldShowAccessEnds(
        {
          accessEndsAtMs: 1_800_000_000_000,
          eventStartsAtMs: null,
          eventEndsAtMs: null,
          place: null,
          kind: 'coupon',
        },
        Date.now()
      )
    ).toBe(true);
  });
});
