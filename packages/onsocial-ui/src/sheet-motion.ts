import {
  noteHandoffProvider,
  releaseHandoffProvider,
} from './sheet-handoff.js';

export type SheetMotion = 'enter' | 'swap' | 'appear';

/** What the shell does. Present, push, replace, and cover are inferred. */
export type SheetOp = 'present' | 'push' | 'replace' | 'cover';

/** `overlay` is a cover (choice, action, discard). `auto` is a sheet the stack places. */
export type SheetStackRole = 'auto' | 'overlay';

/** `page` fills the column. `sheet` is a hug or gesture. `cover` sits on top without a history slot. */
export type SheetStackKind = 'sheet' | 'page' | 'cover';

/** Focus stays parked on the opener through a replace handoff. */
export const SHEET_REPLACE_FOCUS_MS = 180;

/**
 * How long the column stays covered during drawer replace — hug settle,
 * enter slide (~320ms), and one paint buffer so scrims do not drop early.
 */
export const SHEET_HANDOFF_COVER_MS = 480;

type StackEntry = {
  id: symbol;
  kind: SheetStackKind;
};

type Presence = {
  kind: SheetStackKind;
  open: boolean;
  frame: number;
  /** Became open during this commit. Stays set if this id renders again. */
  opening: boolean;
  /** Became closed during this commit. Stays set if this id renders again. */
  closing: boolean;
  /** Unmounted while open. A skipped render is not an unmount. */
  unmounted: boolean;
  /** Frame when `markSheetGone` ran — only counts for swap in that commit. */
  unmountedFrame: number;
};

const stack: StackEntry[] = [];
const presence = new Map<symbol, Presence>();
let presenceFrame = 0;
let presenceFrameOpen = false;
let autoReplaceFrame = -1;
const openSheetListeners = new Set<() => void>();

let replaceToken = 0;
let claimedToken = 0;
let replaceTimer: ReturnType<typeof setTimeout> | null = null;
let coverHoldTimer: ReturnType<typeof setTimeout> | null = null;
let pushToken = 0;
let claimedPushToken = 0;
/** Set while a drawer is taking a menu's slot, so the menu leaves without a slide. */
let coverExitSuppressed = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
const replaceFocusId = Symbol('sheet-replace');

function notifyOpenSheets(): void {
  for (const listener of openSheetListeners) listener();
}

export function subscribeOpenSheets(listener: () => void): () => void {
  openSheetListeners.add(listener);
  return () => {
    openSheetListeners.delete(listener);
  };
}

export function registerOpenSheet(
  id: symbol,
  kind: SheetStackKind = 'sheet'
): void {
  const existing = stack.find((entry) => entry.id === id);
  if (existing) {
    if (existing.kind === kind) return;
    existing.kind = kind;
    notifyOpenSheets();
    return;
  }
  stack.push({ id, kind });
  notifyOpenSheets();
}

export function unregisterOpenSheet(id: symbol): void {
  const index = stack.findIndex((entry) => entry.id === id);
  if (index < 0) return;
  stack.splice(index, 1);
  notifyOpenSheets();
}

/** Sheets already open, not counting `id` once it has registered. */
export function otherOpenSheetCount(id: symbol): number {
  let count = 0;
  for (const entry of stack) {
    if (entry.id !== id) count += 1;
  }
  return count;
}

/**
 * Sheets and pages already open. A menu or confirm is a cover, so it does
 * not turn the next sheet into a push — that sheet presents on its own.
 */
export function otherBaseSheetCount(id: symbol): number {
  let count = 0;
  for (const entry of stack) {
    if (entry.id === id || entry.kind === 'cover') continue;
    count += 1;
  }
  return count;
}

/**
 * A later sheet or page sits above this one. A cover does not.
 */
export function sheetIsCovered(id: symbol): boolean {
  const index = stack.findIndex((entry) => entry.id === id);
  if (index < 0) return false;
  for (let cursor = index + 1; cursor < stack.length; cursor += 1) {
    if (stack[cursor]?.kind !== 'cover') return true;
  }
  return false;
}

function touchPresenceFrame(): number {
  if (!presenceFrameOpen) {
    presenceFrame += 1;
    presenceFrameOpen = true;
    const stamped = presenceFrame;
    queueMicrotask(() => {
      presenceFrameOpen = false;
      if (presenceFrame !== stamped) return;
      for (const [id, entry] of presence) {
        if (entry.unmounted) presence.delete(id);
      }
    });
  }
  return presenceFrame;
}

/**
 * Every sheet reports during render. By the time layout effects run, this
 * commit's open and closed drawers are all recorded, in any tree order.
 */
export function reportSheetPresence(
  id: symbol,
  kind: SheetStackKind,
  open: boolean
): void {
  const frame = touchPresenceFrame();
  const prev = presence.get(id);
  const wasOpen = prev?.open ?? false;
  const sameFrame = prev?.frame === frame;
  presence.set(id, {
    kind,
    open,
    frame,
    opening:
      (open && !wasOpen) || (sameFrame && open && prev?.opening === true),
    closing:
      (!open && wasOpen) || (sameFrame && !open && prev?.closing === true),
    unmounted: false,
    unmountedFrame: -1,
  });
}

/**
 * The sheet left the tree while it was open. Layout cleanups run after
 * render and before the next sheet's layout, so the successor can still
 * claim the swap before paint. A drawer that simply did not re-render
 * must not call this — that was counting a live drawer as gone.
 */
export function markSheetGone(id: symbol): void {
  const entry = presence.get(id);
  if (!entry) return;
  const frame = touchPresenceFrame();
  if (entry.open && entry.kind !== 'cover') {
    entry.unmounted = true;
    entry.unmountedFrame = frame;
    return;
  }
  presence.delete(id);
}

/** Base drawers that closed or unmounted in this commit, excluding `self`. */
export function leavingBaseCount(self: symbol): number {
  let count = 0;
  for (const [id, entry] of presence) {
    if (id === self || entry.kind === 'cover') continue;
    const closedNow = entry.frame === presenceFrame && entry.closing;
    const unmountedNow =
      entry.unmounted && entry.unmountedFrame === presenceFrame;
    if (closedNow || unmountedNow) count += 1;
  }
  return count;
}

/** A drawer or page started opening in this commit. Covers do not count. */
export function baseOpeningBesides(self: symbol): boolean {
  for (const [id, entry] of presence) {
    if (id === self || entry.kind === 'cover') continue;
    if (entry.frame === presenceFrame && entry.opening) return true;
  }
  return false;
}

/** First successor in this commit takes the replace. The rest keep their own motion. */
export function claimAutoReplace(self: symbol): boolean {
  if (leavingBaseCount(self) === 0) return false;
  if (autoReplaceFrame === presenceFrame) return false;
  autoReplaceFrame = presenceFrame;
  armCoverExitSuppression();
  return true;
}

/**
 * The next sheet that opens replaces the one in this slot. Drawers slide in;
 * pages appear. A later task in the same slot keeps its own motion.
 */
export function replaceSheet(): void {
  const issued = ++replaceToken;
  armCoverExitSuppression();
  // Keep the arm through the hold. A same-frame rAF clear let settings drop
  // before the page appear covered the slot.
  noteHandoffProvider(replaceFocusId, true);
  if (replaceTimer != null) clearTimeout(replaceTimer);
  replaceTimer = setTimeout(() => {
    replaceTimer = null;
    if (replaceToken !== issued) return;
    replaceToken = 0;
    claimedToken = 0;
    releaseHandoffProvider(replaceFocusId);
  }, SHEET_REPLACE_FOCUS_MS);
  if (coverHoldTimer != null) clearTimeout(coverHoldTimer);
  coverHoldTimer = setTimeout(() => {
    coverHoldTimer = null;
    clearCoverExitSuppression();
  }, SHEET_HANDOFF_COVER_MS);
}

/** @deprecated Use `replaceSheet`. */
export const beginSheetReplace = replaceSheet;

/**
 * The next sheet opens as a new task. The stack also treats “something is
 * already open” as a push, so callers only need this when the sheet underneath
 * is closing in the same turn.
 */
export function pushSheet(): void {
  const issued = ++pushToken;
  if (pushTimer != null) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    if (pushToken !== issued) return;
    pushToken = 0;
    claimedPushToken = 0;
  }, SHEET_REPLACE_FOCUS_MS);
}

/** First non-cover sheet to open after `replaceSheet` claims the replace. */
export function claimSheetReplace(): boolean {
  if (replaceToken === 0 || claimedToken === replaceToken) return false;
  claimedToken = replaceToken;
  pushToken = 0;
  claimedPushToken = 0;
  return true;
}

/** First non-cover sheet to open after `pushSheet` claims the slide. */
export function claimSheetPush(): boolean {
  if (pushToken === 0 || claimedPushToken === pushToken) return false;
  claimedPushToken = pushToken;
  return true;
}

/** The drawer that replaces a menu arms this before the menu paints its exit. */
export function armCoverExitSuppression(): void {
  coverExitSuppressed = true;
}

/** True while a replacement is opening, so every drawer that is leaving holds. */
export function handoffExitArmed(): boolean {
  return coverExitSuppressed;
}

/** The closing menu consumes it and unmounts instead of sliding away. */
export function takeCoverExitSuppression(): boolean {
  if (!coverExitSuppressed) return false;
  coverExitSuppressed = false;
  return true;
}

export function clearCoverExitSuppression(): void {
  coverExitSuppressed = false;
}

/** Test isolation. */
export function resetSheetMotionState(): void {
  stack.length = 0;
  if (replaceTimer != null) clearTimeout(replaceTimer);
  replaceTimer = null;
  replaceToken = 0;
  claimedToken = 0;
  if (coverHoldTimer != null) clearTimeout(coverHoldTimer);
  coverHoldTimer = null;
  if (pushTimer != null) clearTimeout(pushTimer);
  pushTimer = null;
  pushToken = 0;
  claimedPushToken = 0;
  coverExitSuppressed = false;
  presence.clear();
  presenceFrame = 0;
  presenceFrameOpen = false;
  autoReplaceFrame = -1;
  releaseHandoffProvider(replaceFocusId);
  notifyOpenSheets();
}

/**
 * Two surfaces:
 * - Drawers (`sheet`) always slide. Replace holds the slot; the next slides in.
 * - Pages (`page`) always appear. Compose / editors.
 * - Covers (`overlay`) fade when something is already open.
 * Screens do not pick a third motion.
 */
export function resolveSheetMotion(input: {
  band: boolean;
  requested: SheetMotion;
  stack: SheetStackRole;
  kind?: 'sheet' | 'page';
  claimedReplace: boolean;
  claimedPush?: boolean;
  otherSheetsOpen: number;
  /** Non-cover sheets already open. Defaults to `otherSheetsOpen`. */
  otherBaseSheets?: number;
}): { presentation: SheetMotion; op: SheetOp } {
  const otherBase = input.otherBaseSheets ?? input.otherSheetsOpen;
  const kind = input.kind ?? 'sheet';
  // Drawers never fade — appear is pages and covers only.
  const requested =
    kind === 'sheet' && input.requested === 'appear'
      ? 'enter'
      : input.requested;

  if (input.band) {
    return { presentation: 'swap', op: 'present' };
  }
  if (input.stack === 'overlay') {
    const cover = input.otherSheetsOpen > 0;
    return {
      presentation: cover ? 'appear' : 'enter',
      op: cover ? 'cover' : 'present',
    };
  }
  // A page that is already on screen holds still. Portfolio route changes use this.
  if (requested === 'swap') {
    return { presentation: 'swap', op: 'replace' };
  }
  if (requested === 'appear') {
    return {
      presentation: 'appear',
      op: input.otherSheetsOpen > 0 ? 'cover' : 'present',
    };
  }
  if (input.claimedReplace) {
    // Page editors fade into the slot. Drawers slide into the held slot.
    if (kind === 'page') {
      return { presentation: 'appear', op: 'replace' };
    }
    return { presentation: 'enter', op: 'replace' };
  }
  // Pages never push-slide over another sheet. Only an explicit push claim does.
  if (input.claimedPush) {
    return { presentation: 'enter', op: 'push' };
  }
  if (otherBase > 0 && kind !== 'page') {
    return { presentation: 'enter', op: 'push' };
  }
  if (kind === 'page') {
    return { presentation: 'appear', op: 'present' };
  }
  return { presentation: 'enter', op: 'present' };
}
