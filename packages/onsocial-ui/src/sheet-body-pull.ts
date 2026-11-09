/** Same activation the grip uses before a drag owns the pointer. */
export const SHEET_DRAG_ACTIVATION_PX = 4;

/**
 * Platform long-press. A release after this is not a click — the press already
 * left the tap. iOS uses the same 500ms before a hold becomes its own gesture.
 */
export const SHEET_TAP_MAX_MS = 500;

/** Subpixel rest still counts as the top. */
export const SHEET_PULL_SCROLL_TOP_PX = 1;

export function sheetBodyPullAllowed(input: {
  keyboardOpen: boolean;
  inField: boolean;
  textSelected: boolean;
  /** scrollTop of each vertical scroller from the finger up through the body. */
  scrollTops: number[];
}): boolean {
  if (input.keyboardOpen || input.inField || input.textSelected) return false;
  return input.scrollTops.every((top) => top <= SHEET_PULL_SCROLL_TOP_PX);
}

/**
 * Finger-down continues the grip drag. Up or sideways stays with the scroller
 * so a flick through the list is not a dismiss.
 */
export function sheetBodyPullDirection(
  dx: number,
  dy: number,
  activationPx = SHEET_DRAG_ACTIVATION_PX
): 'pending' | 'pull' | 'abort' {
  if (Math.abs(dx) < activationPx && Math.abs(dy) < activationPx) {
    return 'pending';
  }
  if (dy >= activationPx && dy >= Math.abs(dx)) return 'pull';
  return 'abort';
}

export function elementScrollsVertically(element: HTMLElement): boolean {
  const overflowY = getComputedStyle(element).overflowY;
  if (
    overflowY !== 'auto' &&
    overflowY !== 'scroll' &&
    overflowY !== 'overlay'
  ) {
    return false;
  }
  return element.scrollHeight - element.clientHeight > 1;
}

/** Tops from the target through `boundary`. Null when the target is outside it. */
export function collectVerticalScrollTops(
  start: Element,
  boundary: Element
): number[] | null {
  const tops: number[] = [];
  let node: Element | null = start;
  while (node) {
    if (node instanceof HTMLElement && elementScrollsVertically(node)) {
      tops.push(node.scrollTop);
    }
    if (node === boundary) return tops;
    node = node.parentElement;
  }
  return null;
}

const FIELD_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"], [role="slider"]';

export function sheetPullTargetBlocks(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return Boolean(target.closest(FIELD_SELECTOR));
}

export function sheetPullStartsOnGrip(target: Element): boolean {
  return Boolean(target.closest('.glass-sheet-drag'));
}

/**
 * A press activates the thing under it only while it is still a tap.
 * A downward pull, a slide past the slop, or a hold past the long-press
 * time does not click — the release would land on a different line, or on
 * the page that slid in under the pointer.
 */
export function sheetPressActivatesClick(input: {
  phase: 'pending' | 'pull' | 'abort';
  heldMs: number;
  movedPx: number;
  tapMaxMs?: number;
  activationPx?: number;
}): boolean {
  if (input.phase !== 'pending') return false;
  const activation = input.activationPx ?? SHEET_DRAG_ACTIVATION_PX;
  if (input.movedPx >= activation) return false;
  if (input.heldMs >= (input.tapMaxMs ?? SHEET_TAP_MAX_MS)) return false;
  return true;
}

/**
 * Whole panel can pull once every scroller under the finger, and the sheet
 * body itself, is at the top. The grip keeps its own handler.
 */
export function sheetPullFromPanelBlocked(input: {
  keyboardOpen: boolean;
  inField: boolean;
  onGrip: boolean;
  ancestorTops: number[] | null;
  sheetBodyTop: number | null;
}): boolean {
  if (input.keyboardOpen || input.inField || input.onGrip) return true;
  if (!input.ancestorTops) return true;
  if (input.ancestorTops.some((top) => top > SHEET_PULL_SCROLL_TOP_PX)) {
    return true;
  }
  return (
    input.sheetBodyTop != null && input.sheetBodyTop > SHEET_PULL_SCROLL_TOP_PX
  );
}
