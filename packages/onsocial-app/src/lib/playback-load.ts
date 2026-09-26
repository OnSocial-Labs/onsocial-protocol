/** One in-flight resolve may assign `audio.src`. A later play cancels the earlier one. */

export function beginPlaybackLoad(current: number): {
  issued: number;
  next: number;
} {
  const next = current + 1;
  return { issued: next, next };
}

export function playbackLoadIsCurrent(issued: number, current: number): boolean {
  return issued === current;
}

/**
 * `replace` always loads the new source (hero switch).
 * `if-needed` keeps the current source when the track index did not change.
 */
export function shouldApplyPlaybackSrc(opts: {
  mode: 'replace' | 'if-needed';
  indexChanged: boolean;
  hasSrc: boolean;
}): boolean {
  if (opts.mode === 'replace') return true;
  return opts.indexChanged || !opts.hasSrc;
}
