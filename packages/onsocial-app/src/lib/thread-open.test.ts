import { describe, expect, it } from 'vitest';
import { planThreadLoad, scrollOpenedPostUnderHeader } from './thread-open';

describe('planThreadLoad', () => {
  it('keeps a seeded thread in the background, including a second setup', () => {
    const key = 'alice.near/post/1';
    const first = planThreadLoad(key, key);
    expect(first.background).toBe(true);
    const again = planThreadLoad(first.paintedKey, key);
    expect(again.background).toBe(true);
  });

  it('shows the skeleton once for a cold thread, then keeps it painted', () => {
    const key = 'alice.near/post/2';
    const first = planThreadLoad(null, key);
    expect(first.background).toBe(false);
    const again = planThreadLoad(first.paintedKey, key);
    expect(again.background).toBe(true);
  });

  it('starts a new post in front when that post is not painted yet', () => {
    const first = planThreadLoad('alice.near/post/1', 'alice.near/post/2');
    expect(first).toEqual({
      background: false,
      paintedKey: 'alice.near/post/2',
    });
  });
});

describe('scrollOpenedPostUnderHeader', () => {
  it('scrolls the thread body so the opened post sits under the header', () => {
    const scroller = {
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 80 }),
    };
    const post = {
      closest: () => scroller,
      getBoundingClientRect: () => ({ top: 640 }),
    };
    expect(scrollOpenedPostUnderHeader(post as unknown as HTMLElement)).toBe(
      true
    );
    expect(scroller.scrollTop).toBe(560);
  });

  it('does nothing when the post is outside a thread scroller', () => {
    const post = {
      closest: () => null,
      getBoundingClientRect: () => ({ top: 0 }),
    };
    expect(scrollOpenedPostUnderHeader(post as unknown as HTMLElement)).toBe(
      false
    );
  });

  it('leaves the scroll alone when the post is already under the header', () => {
    const scroller = {
      scrollTop: 120,
      getBoundingClientRect: () => ({ top: 80 }),
    };
    const post = {
      closest: () => scroller,
      getBoundingClientRect: () => ({ top: 80 }),
    };
    expect(scrollOpenedPostUnderHeader(post as unknown as HTMLElement)).toBe(
      true
    );
    expect(scroller.scrollTop).toBe(120);
  });
});
