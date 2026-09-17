/** Untitled chapter / section — not Manuscript. */
export function writingUntitledLabel(opts?: { isPdf?: boolean }): string {
  return opts?.isPdf ? 'PDF' : 'Writing';
}
