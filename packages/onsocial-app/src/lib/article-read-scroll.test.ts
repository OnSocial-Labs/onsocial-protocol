import { describe, expect, it } from 'vitest';
import {
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
