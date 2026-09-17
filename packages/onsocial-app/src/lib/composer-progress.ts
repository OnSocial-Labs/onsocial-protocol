/** Word count for article progress — same idea as Writing shelf read labels. */
export function countComposerWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/** Quiet footer label — words while writing an article, else chars left. */
export function composerProgressLabel(opts: {
  articleMode: boolean;
  text: string;
  textRemaining: number;
  showTextCount: boolean;
}): string | null {
  if (opts.articleMode) {
    const words = countComposerWords(opts.text);
    if (words <= 0 && !opts.showTextCount) return null;
    if (words <= 0) return `${opts.textRemaining}`;
    return `${words} ${words === 1 ? 'word' : 'words'}`;
  }
  if (!opts.showTextCount) return null;
  return `${opts.textRemaining}`;
}
