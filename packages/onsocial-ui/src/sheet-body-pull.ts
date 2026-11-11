/** Same activation the grip uses before a drag owns the pointer. */
export const SHEET_DRAG_ACTIVATION_PX = 4;

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
 * Downward travel that confirms a pull. Shorter motion stays a tap, so a
 * slow or shaky press still activates the control under the finger.
 */
export const SHEET_PULL_CONFIRM_PX = 10;

/**
 * A press activates the thing under it unless a downward pull is confirmed.
 * Time on the finger is not a reason to swallow the click.
 */
export function sheetPressActivatesClick(input: {
  phase: 'pending' | 'pull' | 'abort';
}): boolean {
  return input.phase !== 'pull';
}

/**
 * At the top of a sheet, the first downward-dominant touch claims the gesture
 * so the platform does not start a pan and cancel the pointer. One claim is
 * enough. Opted-out regions and scrolled bodies are decided by the caller.
 */
export function sheetShouldClaimFirstDownwardMove(input: {
  phase: 'pending' | 'pull' | 'abort' | null;
  dx: number;
  dy: number;
  alreadyClaimed: boolean;
}): boolean {
  if (input.alreadyClaimed || input.phase !== 'pending') return false;
  return input.dy > 0 && input.dy >= Math.abs(input.dx);
}

/** Body pull tracks mouse, touch, and pen. Selection stays until pull confirms. */
export function sheetPullPointerCanDrag(pointerType: string): boolean {
  return (
    pointerType === 'mouse' || pointerType === 'touch' || pointerType === 'pen'
  );
}

/** Selection stays available until a pull is confirmed. */
export function sheetShouldBlockTextSelection(
  phase: 'pending' | 'pull' | 'abort' | null
): boolean {
  return phase === 'pull';
}

/**
 * Native pan and scroll keep the touch until a pull is confirmed.
 * Opt out with `data-sheet-pull="off"` on maps, canvases, and carousels.
 */
export function sheetTouchMovePreventsNativePan(
  phase: 'pending' | 'pull' | 'abort' | null
): boolean {
  return phase === 'pull';
}

export const SHEET_PULL_OPT_OUT_SELECTOR = '[data-sheet-pull="off"]';

export function sheetPullOptOutFromClosest(
  closest: ((selector: string) => unknown) | undefined
): boolean {
  return Boolean(closest?.(SHEET_PULL_OPT_OUT_SELECTOR));
}

export function elementOptsOutOfSheetPull(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) {
    return false;
  }
  return sheetPullOptOutFromClosest((selector) => target.closest(selector));
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
