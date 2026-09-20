import { describe, expect, it } from 'vitest';
import {
  ARTICLE_READ_END_PX,
  articlePageScrollable,
  articleReadProgress,
  articleWakeFooterVisible,
  isArticleChromeTapTarget,
  nextArticleChromeQuiet,
  shouldIgnoreArticleChromeTap,
} from './use-article-read-chrome';

describe('articlePageScrollable', () => {
  it('needs more than a few pixels of overflow', () => {
    expect(articlePageScrollable(600, 600)).toBe(false);
    expect(articlePageScrollable(608, 600)).toBe(false);
    expect(articlePageScrollable(620, 600)).toBe(true);
  });
});

describe('articleReadProgress', () => {
  it('is 0 when the page cannot scroll', () => {
    expect(articleReadProgress(0, 600, 600)).toBe(0);
    expect(articleReadProgress(12, 400, 400)).toBe(0);
  });

  it('tracks the overflow ratio', () => {
    expect(articleReadProgress(0, 1000, 500)).toBe(0);
    expect(articleReadProgress(250, 1000, 500)).toBe(0.5);
    expect(articleReadProgress(500, 1000, 500)).toBe(1);
    expect(articleReadProgress(800, 1000, 500)).toBe(1);
  });
});

describe('nextArticleChromeQuiet', () => {
  it('stays loud at the top and near the end', () => {
    expect(
      nextArticleChromeQuiet({
        accum: 40,
        deltaY: 20,
        progress: 0,
        quiet: true,
      })
    ).toEqual({ accum: 0, quiet: false });
    expect(
      nextArticleChromeQuiet({
        accum: 40,
        deltaY: 20,
        progress: ARTICLE_READ_END_PX,
        quiet: true,
      })
    ).toEqual({ accum: 0, quiet: false });
  });

  it('folds after enough scroll down, wakes after enough scroll up', () => {
    expect(
      nextArticleChromeQuiet({
        accum: 20,
        deltaY: 12,
        progress: 0.4,
        quiet: false,
      })
    ).toEqual({ accum: 0, quiet: true });
    expect(
      nextArticleChromeQuiet({
        accum: -10,
        deltaY: -12,
        progress: 0.4,
        quiet: true,
      })
    ).toEqual({ accum: 0, quiet: false });
  });
});

describe('articleWakeFooterVisible', () => {
  it('shows with the jacket at rest and hides while reading', () => {
    expect(articleWakeFooterVisible(false)).toBe(true);
    expect(articleWakeFooterVisible(true)).toBe(false);
  });
});

describe('shouldIgnoreArticleChromeTap', () => {
  it('ignores taps while the write dock is up and just after it closes', () => {
    expect(shouldIgnoreArticleChromeTap(true, 1000, 0)).toBe(true);
    expect(shouldIgnoreArticleChromeTap(false, 1000, 1200)).toBe(true);
    expect(shouldIgnoreArticleChromeTap(false, 1000, 800)).toBe(false);
  });
});

describe('isArticleChromeTapTarget', () => {
  it('rejects non-elements', () => {
    expect(isArticleChromeTapTarget(null)).toBe(false);
    expect(isArticleChromeTapTarget('p')).toBe(false);
  });
});
