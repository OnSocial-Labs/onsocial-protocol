import { getAppLenis, type AppLenisScroll } from '@/lib/app-lenis-registry';

export type ArticleScrollMemory = {
  shownKey: string;
  tops: Readonly<Record<string, number>>;
};

/** One reader session. The open essay starts at the top. */
export function articleScrollMemory(shownKey: string): ArticleScrollMemory {
  return { shownKey, tops: {} };
}

/** Remember where this essay is before the reader shows another one. */
export function saveArticleScroll(
  memory: ArticleScrollMemory,
  scrollTop: number
): ArticleScrollMemory {
  return {
    shownKey: memory.shownKey,
    tops: { ...memory.tops, [memory.shownKey]: scrollTop },
  };
}

/**
 * Show another essay. A first visit starts at the top.
 * A return restores the place saved for that essay.
 */
export function commitArticleScroll(
  memory: ArticleScrollMemory,
  nextKey: string
): { memory: ArticleScrollMemory; scrollTop: number } {
  if (memory.shownKey === nextKey) {
    return { memory, scrollTop: memory.tops[nextKey] ?? 0 };
  }
  return {
    memory: { shownKey: nextKey, tops: memory.tops },
    scrollTop: memory.tops[nextKey] ?? 0,
  };
}

const ARTICLE_SCROLL_JUMP = { immediate: true, force: true } as const;

/**
 * Lenis keeps coasting after a bare `scrollTop` write, so the next essay
 * stays where the last one was. A jump to the target it already has is
 * ignored, so nudge off that target first when the view is still moving.
 */
export function applyArticleScroll(root: HTMLElement, top: number): void {
  const goal = Math.max(0, Math.round(Number.isFinite(top) ? top : 0));
  const lenis = getAppLenis(root);
  if (!lenis) {
    root.scrollTop = goal;
    return;
  }
  jumpArticleScroll(lenis, goal);
}

function jumpArticleScroll(lenis: AppLenisScroll, goal: number): void {
  if (Math.round(lenis.scroll) !== goal) {
    lenis.scrollTo(goal === 0 ? 1 : goal - 1, ARTICLE_SCROLL_JUMP);
  }
  lenis.scrollTo(goal, ARTICLE_SCROLL_JUMP);
}
