import { describe, expect, it } from 'vitest';
import {
  registerAppLenis,
  unregisterAppLenis,
  type AppLenisScroll,
} from '@/lib/app-lenis-registry';
import {
  applyArticleScroll,
  articleScrollMemory,
  commitArticleScroll,
  saveArticleScroll,
} from './article-read-scroll';

describe('article read scroll', () => {
  it('starts the next essay at the top and restores the one you left', () => {
    const saved = saveArticleScroll(articleScrollMemory('night'), 480);
    const next = commitArticleScroll(saved, 'print');
    expect(next.scrollTop).toBe(0);
    expect(next.memory.shownKey).toBe('print');

    const left = saveArticleScroll(next.memory, 120);
    const back = commitArticleScroll(left, 'night');
    expect(back.scrollTop).toBe(480);
    expect(back.memory.shownKey).toBe('night');
  });

  it('keeps a later visit to the same essay', () => {
    const first = commitArticleScroll(
      saveArticleScroll(articleScrollMemory('night'), 480),
      'print'
    );
    const again = commitArticleScroll(
      saveArticleScroll(first.memory, 120),
      'print'
    );
    expect(again.scrollTop).toBe(120);
  });
});

describe('applyArticleScroll', () => {
  it('writes the element when Lenis is not driving it', () => {
    const root = { scrollTop: 240 } as HTMLElement;
    applyArticleScroll(root, 0);
    expect(root.scrollTop).toBe(0);
  });

  it('stops a coast so the next essay starts at the top', () => {
    const root = {} as HTMLElement;
    const state = { scroll: 265, target: 279 };
    const lenis: AppLenisScroll = {
      limit: 800,
      get scroll() {
        return state.scroll;
      },
      resize() {},
      scrollTo(next) {
        const goal = Math.round(next);
        if (goal === state.target) return;
        state.target = goal;
        state.scroll = goal;
      },
    };
    registerAppLenis(root, lenis);
    applyArticleScroll(root, 0);
    unregisterAppLenis(root);
    expect(state.scroll).toBe(0);
    expect(state.target).toBe(0);
  });
});
