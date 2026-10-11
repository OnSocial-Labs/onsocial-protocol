/** Lead before the name meets the bar. Matches the 2.5rem timeline box. */
const IMMERSIVE_TITLE_LEAD_PX = 40;

/** 0 while the page title is clear of the bar, 1 once it has passed under. */
export function immersiveTitleHandoff(
  titleTop: number,
  headerBottom: number,
  titleHeight: number
): number {
  const span = IMMERSIVE_TITLE_LEAD_PX + Math.max(titleHeight, 1);
  const traveled = IMMERSIVE_TITLE_LEAD_PX - (titleTop - headerBottom);
  return Math.max(0, Math.min(1, traveled / span));
}
