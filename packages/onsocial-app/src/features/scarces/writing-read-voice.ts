/** Untitled chapter / section — not Manuscript. */
export function writingUntitledLabel(opts?: { isPdf?: boolean }): string {
  return opts?.isPdf ? 'PDF' : 'Writing';
}

/**
 * Heading under a masthead that already names the work.
 * The same name is not printed again. A book still names a chapter
 * when that name is different, or "Chapter N" when the chapter is untitled.
 */
export function readerChapterHeading(opts: {
  chapterTitle: string;
  workTitle: string;
  isBook: boolean;
  untitledBookLabel?: string;
}): string | null {
  const chapter = opts.chapterTitle.trim();
  const work = opts.workTitle.trim();
  if (chapter && work && chapter.toLowerCase() === work.toLowerCase()) {
    return null;
  }
  if (chapter) return chapter;
  if (!opts.isBook) return null;
  const fallback = opts.untitledBookLabel?.trim() ?? '';
  return fallback || null;
}

/** Drop a leading markdown heading that repeats a title already on the page. */
export function stripLeadingRepeatedHeading(
  body: string,
  titles: readonly string[]
): string {
  const known = new Set(
    titles.map((title) => title.trim().toLowerCase()).filter(Boolean)
  );
  if (known.size === 0) return body;
  const match = body.match(
    /^(?:\uFEFF)?[ \t]{0,3}#{1,6}[ \t]+([^\n]*?)[ \t]*#*[ \t]*(?:\r?\n+|$)/
  );
  if (!match?.[1]) return body;
  if (!known.has(match[1].trim().toLowerCase())) return body;
  return body.slice(match[0].length);
}
