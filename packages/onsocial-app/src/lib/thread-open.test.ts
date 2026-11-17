import { describe, expect, it, vi } from 'vitest';
import { registerAppLenis } from './app-lenis-registry';
import {
  compensateOpenedPostAboveShift,
  planThreadLoad,
  scrollOpenedPostUnderHeader,
  threadContentInset,
  threadCoverReady,
} from './thread-open';

describe('threadCoverReady', () => {
  it('opens the cover for a seeded root before replies resolve', () => {
    expect(
      threadCoverReady({
        loadState: 'ready',
        hasRoot: true,
        repliesResolved: false,
      })
    ).toBe(true);
  });

  it('keeps the cover when a cold load has no root', () => {
    expect(
      threadCoverReady({
        loadState: 'loading',
        hasRoot: false,
        repliesResolved: false,
      })
    ).toBe(false);
  });

  it('lifts the cover for a finished miss or error', () => {
    expect(threadCoverReady({ loadState: 'missing', hasRoot: false })).toBe(
      true
    );
    expect(threadCoverReady({ loadState: 'error', hasRoot: false })).toBe(true);
  });
});

describe('planThreadLoad', () => {
  it('keeps a seeded thread in the background, including a second setup', () => {
    const key = 'alice.near/post/1';
    const first = planThreadLoad(key, key);
    expect(first.background).toBe(true);
    const again = planThreadLoad(first.paintedKey, key);
    expect(again.background).toBe(true);
  });

  it('marks a cold thread as not yet painted, then keeps it painted', () => {
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
  it('scrolls so the avatar sits under the header', () => {
    const scroller = {
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 80 }),
    };
    const post = {
      closest: () => scroller,
      querySelector: () => null,
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
      querySelector: () => null,
      getBoundingClientRect: () => ({ top: 0 }),
    };
    expect(scrollOpenedPostUnderHeader(post as unknown as HTMLElement)).toBe(
      false
    );
  });

  it('adopts Lenis with stop/start before sticking the post', () => {
    const calls: number[] = [];
    const scroller = {
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 80 }),
    };
    const lenis = {
      limit: Number.POSITIVE_INFINITY,
      scroll: 0,
      stop: vi.fn(),
      start: vi.fn(),
      resize() {
        this.scroll = scroller.scrollTop;
      },
      scrollTo(target: number) {
        calls.push(target);
        this.scroll = target;
      },
    };
    registerAppLenis(scroller as unknown as HTMLElement, lenis);
    const post = {
      closest: () => scroller,
      querySelector: () => null,
      getBoundingClientRect: () => ({ top: 640 }),
    };
    expect(scrollOpenedPostUnderHeader(post as unknown as HTMLElement)).toBe(
      true
    );
    expect(lenis.stop).toHaveBeenCalledOnce();
    expect(calls).toEqual([560]);
    expect(lenis.start).toHaveBeenCalledOnce();
    expect(scroller.scrollTop).toBe(560);
  });

  it('leaves the scroll alone when the avatar is already under the header', () => {
    const scroller = {
      scrollTop: 120,
      getBoundingClientRect: () => ({ top: 80 }),
    };
    const post = {
      closest: () => scroller,
      querySelector: () => null,
      getBoundingClientRect: () => ({ top: 80 }),
    };
    expect(scrollOpenedPostUnderHeader(post as unknown as HTMLElement)).toBe(
      true
    );
    expect(scroller.scrollTop).toBe(120);
  });

  it('pins by avatar, not the card wrapper top', () => {
    const scroller = {
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 80 }),
    };
    const page = {
      getBoundingClientRect: () => ({ top: 80 }),
    };
    const card = {};
    const face = {
      getBoundingClientRect: () => ({ top: 200 }),
      closest: (selector: string) => (selector === '.post-card' ? card : null),
    };
    const post = {
      closest: (selector: string) => {
        if (selector === '.os-app-screen-body') return scroller;
        if (selector === '.os-app-chrome-page') return page;
        return null;
      },
      querySelector: () => face,
      getBoundingClientRect: () => ({ top: 160 }),
    };
    const previous = globalThis.getComputedStyle;
    globalThis.getComputedStyle = ((el: { paddingTop?: string }) => {
      if (el === card) return { paddingTop: '12px' } as CSSStyleDeclaration;
      if (el === page) return { paddingTop: '0px' } as CSSStyleDeclaration;
      return { paddingTop: '0px' } as CSSStyleDeclaration;
    }) as typeof getComputedStyle;
    try {
      expect(scrollOpenedPostUnderHeader(post as unknown as HTMLElement)).toBe(
        true
      );
      // face 200 − (scroller 80 + page 0 + card 12) = 108
      expect(scroller.scrollTop).toBe(108);
    } finally {
      globalThis.getComputedStyle = previous;
    }
  });
});

describe('compensateOpenedPostAboveShift', () => {
  it('bumps scroll by above-growth so a long ancestor does not shove the avatar', () => {
    let scrollTop = 200;
    const scroller = {
      get scrollTop() {
        return scrollTop;
      },
      set scrollTop(value: number) {
        scrollTop = value;
      },
      getBoundingClientRect: () => ({ top: 80 }),
    };
    const post = {
      closest: () => scroller,
      querySelector: () => null,
      getBoundingClientRect: () => ({ top: 120 }),
    };
    compensateOpenedPostAboveShift(
      post as unknown as HTMLElement,
      scroller as unknown as HTMLElement,
      200
    );
    expect(scrollTop).toBe(240);
  });
});

describe('threadContentInset', () => {
  it('uses live page geometry so root and reply share one seat', () => {
    const scroller = {
      scrollTop: 40,
      getBoundingClientRect: () => ({ top: 100 }),
    };
    const page = {
      getBoundingClientRect: () => ({ top: 180 }),
    };
    const post = {
      closest: (selector: string) =>
        selector === '.os-app-chrome-page' ? page : scroller,
    };
    const previous = globalThis.getComputedStyle;
    globalThis.getComputedStyle = (() =>
      ({
        paddingTop: '8px',
      }) as CSSStyleDeclaration) as typeof getComputedStyle;
    try {
      expect(
        threadContentInset(
          scroller as unknown as HTMLElement,
          post as unknown as HTMLElement
        )
      ).toBe(180 - 100 + 40 + 8);
    } finally {
      globalThis.getComputedStyle = previous;
    }
  });
});
