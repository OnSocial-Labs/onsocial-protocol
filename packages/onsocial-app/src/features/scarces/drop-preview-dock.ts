/**
 * A create-drop preview is a local file. While it is audible the dock pauses.
 * When the preview stops, the dock resumes only if it is still paused.
 */
export function nextDockHoldForPreview(opts: {
  dockPlaying: boolean;
  holdingDock: boolean;
  previewPlaying: boolean;
}): { holdingDock: boolean; pauseDock: boolean; resumeDock: boolean } {
  if (opts.previewPlaying && opts.dockPlaying && !opts.holdingDock) {
    return { holdingDock: true, pauseDock: true, resumeDock: false };
  }
  if (!opts.previewPlaying && opts.holdingDock) {
    return {
      holdingDock: false,
      pauseDock: false,
      resumeDock: !opts.dockPlaying,
    };
  }
  return {
    holdingDock: opts.holdingDock,
    pauseDock: false,
    resumeDock: false,
  };
}
