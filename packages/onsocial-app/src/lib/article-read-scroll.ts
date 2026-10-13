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
