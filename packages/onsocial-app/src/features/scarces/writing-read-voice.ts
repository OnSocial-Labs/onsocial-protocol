/** Locked writing reader / drop-page Read hint. */
export function writingReadLockedHint(opts: {
  isConnected: boolean;
  holdsEdition: boolean | null;
}): string {
  if (!opts.isConnected) return 'Connect to read.';
  if (opts.holdsEdition === null) return 'Checking your edition…';
  return 'Collect an edition to read.';
}

/** Untitled chapter / section — not Manuscript. */
export function writingUntitledLabel(opts?: { isPdf?: boolean }): string {
  return opts?.isPdf ? 'PDF' : 'Writing';
}
