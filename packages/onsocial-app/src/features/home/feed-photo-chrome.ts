/** Tap-quiet on a photo or video face. Thread, scrub, and an open caption stay loud. */
export function mediaFaceChromeQuiet(input: {
  open: boolean;
  chromeVisible: boolean;
  scrubbing: boolean;
  captionExpanded: boolean;
  threadOpen: boolean;
}): boolean {
  return (
    input.open &&
    !input.chromeVisible &&
    !input.scrubbing &&
    !input.captionExpanded &&
    !input.threadOpen
  );
}
