import { afterEach, describe, expect, it, vi } from 'vitest';
import { sheetHandoffFocusActive } from './sheet-handoff.js';
import {
  armCoverExitSuppression,
  beginSheetReplace,
  baseOpeningBesides,
  claimAutoReplace,
  claimSheetPush,
  claimSheetReplace,
  leavingBaseCount,
  otherBaseSheetCount,
  otherOpenSheetCount,
  pushSheet,
  markSheetGone,
  registerOpenSheet,
  replaceSheet,
  reportSheetPresence,
  resetSheetMotionState,
  takeCoverExitSuppression,
  resolveSheetMotion,
  SHEET_REPLACE_FOCUS_MS,
  sheetIsCovered,
  unregisterOpenSheet,
} from './sheet-motion.js';

afterEach(() => {
  resetSheetMotionState();
  vi.useRealTimers();
});

describe('resolveSheetMotion', () => {
  const base = {
    band: false,
    requested: 'enter' as const,
    stack: 'auto' as const,
    kind: 'sheet' as const,
    claimedReplace: false,
    claimedPush: false,
    otherSheetsOpen: 0,
  };

  it('presents the first sheet by sliding it up', () => {
    expect(resolveSheetMotion(base)).toEqual({
      presentation: 'enter',
      op: 'present',
    });
  });

  it('fades a page onto an empty column', () => {
    expect(resolveSheetMotion({ ...base, kind: 'page' })).toEqual({
      presentation: 'appear',
      op: 'present',
    });
  });

  it('slides a drawer that claimed the replace into the held slot', () => {
    expect(resolveSheetMotion({ ...base, claimedReplace: true })).toEqual({
      presentation: 'enter',
      op: 'replace',
    });
  });

  it('ignores appear on a drawer so drawers always slide', () => {
    expect(
      resolveSheetMotion({ ...base, requested: 'appear', claimedReplace: true })
    ).toEqual({
      presentation: 'enter',
      op: 'replace',
    });
  });

  it('pushes a task over an open sheet', () => {
    expect(
      resolveSheetMotion({ ...base, otherSheetsOpen: 1, otherBaseSheets: 1 })
    ).toEqual({
      presentation: 'enter',
      op: 'push',
    });
  });

  it('leaves a sheet alone when a choice opens over it', () => {
    expect(
      resolveSheetMotion({ ...base, otherSheetsOpen: 1, otherBaseSheets: 0 })
    ).toEqual({
      presentation: 'enter',
      op: 'present',
    });
  });

  it('still pushes when a choice sits on the sheet underneath', () => {
    expect(
      resolveSheetMotion({ ...base, otherSheetsOpen: 2, otherBaseSheets: 1 })
    ).toEqual({
      presentation: 'enter',
      op: 'push',
    });
  });

  it('fades a page when a menu is open and the page did not claim the replace', () => {
    expect(
      resolveSheetMotion({
        ...base,
        kind: 'page',
        otherSheetsOpen: 1,
        otherBaseSheets: 0,
      })
    ).toEqual({
      presentation: 'appear',
      op: 'present',
    });
  });

  it('fades a page over an open sheet like compose', () => {
    expect(
      resolveSheetMotion({ ...base, kind: 'page', otherSheetsOpen: 1 })
    ).toEqual({
      presentation: 'appear',
      op: 'present',
    });
  });

  it('slides a page only when push is claimed', () => {
    expect(
      resolveSheetMotion({
        ...base,
        kind: 'page',
        claimedPush: true,
        otherSheetsOpen: 1,
      })
    ).toEqual({
      presentation: 'enter',
      op: 'push',
    });
  });

  it('holds an in-place page swap without a crossfade', () => {
    expect(
      resolveSheetMotion({
        ...base,
        kind: 'page',
        requested: 'swap',
        claimedReplace: true,
        otherSheetsOpen: 1,
      })
    ).toEqual({ presentation: 'swap', op: 'replace' });
  });

  it('leaves an explicit page appear alone during a replace', () => {
    expect(
      resolveSheetMotion({
        ...base,
        kind: 'page',
        requested: 'appear',
        claimedReplace: true,
      })
    ).toEqual({ presentation: 'appear', op: 'present' });
  });

  it('fades a page that claims replace instead of sliding like a drawer', () => {
    expect(
      resolveSheetMotion({
        ...base,
        kind: 'page',
        claimedReplace: true,
        otherSheetsOpen: 1,
      })
    ).toEqual({
      presentation: 'appear',
      op: 'replace',
    });
  });

  it('fades a cover when another sheet is open', () => {
    expect(
      resolveSheetMotion({
        ...base,
        stack: 'overlay',
        otherSheetsOpen: 1,
        claimedReplace: true,
      })
    ).toEqual({ presentation: 'appear', op: 'cover' });
  });

  it('slides a cover that is the first sheet', () => {
    expect(resolveSheetMotion({ ...base, stack: 'overlay' })).toEqual({
      presentation: 'enter',
      op: 'present',
    });
  });

  it('keeps band sheets in place', () => {
    expect(resolveSheetMotion({ ...base, band: true })).toEqual({
      presentation: 'swap',
      op: 'present',
    });
  });

  it('slides a pushed page even when the column looks empty', () => {
    expect(
      resolveSheetMotion({ ...base, kind: 'page', claimedPush: true })
    ).toEqual({
      presentation: 'enter',
      op: 'push',
    });
  });
});

describe('sheet stack', () => {
  it('lets only the first opener claim the replace', () => {
    replaceSheet();
    expect(claimSheetReplace()).toBe(true);
    expect(claimSheetReplace()).toBe(false);
    expect(beginSheetReplace).toBe(replaceSheet);
  });

  it('expires an unclaimed replace so a later sheet still presents', () => {
    vi.useFakeTimers();
    replaceSheet();
    expect(sheetHandoffFocusActive()).toBe(true);
    vi.advanceTimersByTime(SHEET_REPLACE_FOCUS_MS);
    expect(sheetHandoffFocusActive()).toBe(false);
    expect(claimSheetReplace()).toBe(false);
  });

  it('lets only the first opener claim a push', () => {
    pushSheet();
    expect(claimSheetPush()).toBe(true);
    expect(claimSheetPush()).toBe(false);
  });

  it('drops a pending push when the replace is claimed', () => {
    pushSheet();
    replaceSheet();
    expect(claimSheetReplace()).toBe(true);
    expect(claimSheetPush()).toBe(false);
  });

  it('ignores a menu when deciding whether the next sheet pushes', () => {
    const menu = Symbol('menu');
    const facts = Symbol('facts');
    registerOpenSheet(menu, 'cover');
    expect(otherOpenSheetCount(facts)).toBe(1);
    expect(otherBaseSheetCount(facts)).toBe(0);
    registerOpenSheet(facts, 'sheet');
    expect(otherBaseSheetCount(menu)).toBe(1);
    expect(sheetIsCovered(menu)).toBe(true);
  });

  it('counts other open sheets and not itself', () => {
    const parent = Symbol('parent');
    const child = Symbol('child');
    registerOpenSheet(parent);
    expect(otherOpenSheetCount(child)).toBe(1);
    registerOpenSheet(child);
    expect(otherOpenSheetCount(child)).toBe(1);
    unregisterOpenSheet(parent);
    expect(otherOpenSheetCount(child)).toBe(0);
  });

  it('lets the closing menu consume the handoff once', () => {
    expect(takeCoverExitSuppression()).toBe(false);
    armCoverExitSuppression();
    expect(takeCoverExitSuppression()).toBe(true);
    expect(takeCoverExitSuppression()).toBe(false);
  });

  it('marks the sheet under a later drawer and not under a cover', () => {
    const parent = Symbol('parent');
    const task = Symbol('task');
    const cover = Symbol('cover');
    registerOpenSheet(parent, 'sheet');
    registerOpenSheet(cover, 'cover');
    expect(sheetIsCovered(parent)).toBe(false);
    registerOpenSheet(task, 'page');
    expect(sheetIsCovered(parent)).toBe(true);
    expect(sheetIsCovered(cover)).toBe(true);
    expect(sheetIsCovered(task)).toBe(false);
    unregisterOpenSheet(task);
    expect(sheetIsCovered(parent)).toBe(false);
  });
});

async function flushPresenceFrame(): Promise<void> {
  await Promise.resolve();
}

describe('sheet presence', () => {
  it('swaps when one drawer closes as the next one opens', async () => {
    const settings = Symbol('settings');
    const rooms = Symbol('rooms');
    reportSheetPresence(settings, 'sheet', true);
    await flushPresenceFrame();
    reportSheetPresence(settings, 'sheet', false);
    reportSheetPresence(rooms, 'sheet', true);
    expect(claimAutoReplace(rooms)).toBe(true);
    expect(claimAutoReplace(rooms)).toBe(false);
    expect(baseOpeningBesides(settings)).toBe(true);
  });

  it('pushes when the drawer underneath stays open', async () => {
    const parent = Symbol('parent');
    const child = Symbol('child');
    reportSheetPresence(parent, 'sheet', true);
    await flushPresenceFrame();
    reportSheetPresence(parent, 'sheet', true);
    reportSheetPresence(child, 'sheet', true);
    expect(leavingBaseCount(child)).toBe(0);
    expect(claimAutoReplace(child)).toBe(false);
  });

  it('does not treat a closing menu as a drawer leaving', async () => {
    const menu = Symbol('menu');
    const facts = Symbol('facts');
    reportSheetPresence(menu, 'cover', true);
    await flushPresenceFrame();
    reportSheetPresence(menu, 'cover', false);
    reportSheetPresence(facts, 'sheet', true);
    expect(leavingBaseCount(facts)).toBe(0);
    expect(claimAutoReplace(facts)).toBe(false);
  });

  it('does not treat a choice opening on a staying drawer as a swap', async () => {
    const sheet = Symbol('sheet');
    const choice = Symbol('choice');
    reportSheetPresence(sheet, 'sheet', true);
    await flushPresenceFrame();
    reportSheetPresence(sheet, 'sheet', true);
    reportSheetPresence(choice, 'cover', true);
    expect(baseOpeningBesides(sheet)).toBe(false);
    expect(claimAutoReplace(choice)).toBe(false);
  });

  it('swaps when a drawer unmounts while it is still open', async () => {
    const list = Symbol('list');
    const buy = Symbol('buy');
    reportSheetPresence(list, 'sheet', true);
    markSheetGone(list);
    reportSheetPresence(buy, 'sheet', true);
    expect(leavingBaseCount(buy)).toBe(1);
    expect(claimAutoReplace(buy)).toBe(true);
  });

  it('does not swap on a later open after an unmount in a prior commit', async () => {
    const list = Symbol('list');
    const buy = Symbol('buy');
    reportSheetPresence(list, 'sheet', true);
    await flushPresenceFrame();
    markSheetGone(list);
    await flushPresenceFrame();
    reportSheetPresence(buy, 'sheet', true);
    expect(leavingBaseCount(buy)).toBe(0);
    expect(claimAutoReplace(buy)).toBe(false);
  });

  it('does not swap when a drawer stays open and skips a render', async () => {
    const parent = Symbol('parent');
    const child = Symbol('child');
    reportSheetPresence(parent, 'sheet', true);
    await flushPresenceFrame();
    reportSheetPresence(child, 'sheet', true);
    expect(leavingBaseCount(child)).toBe(0);
    expect(claimAutoReplace(child)).toBe(false);
  });

  it('does not treat an unmounted menu as a drawer leaving', async () => {
    const menu = Symbol('menu');
    const facts = Symbol('facts');
    reportSheetPresence(menu, 'cover', true);
    await flushPresenceFrame();
    markSheetGone(menu);
    reportSheetPresence(facts, 'sheet', true);
    expect(leavingBaseCount(facts)).toBe(0);
    expect(claimAutoReplace(facts)).toBe(false);
  });

  it('ignores a drawer that is mounted closed', async () => {
    const closed = Symbol('closed');
    const next = Symbol('next');
    reportSheetPresence(closed, 'sheet', false);
    await flushPresenceFrame();
    reportSheetPresence(closed, 'sheet', false);
    reportSheetPresence(next, 'sheet', true);
    expect(leavingBaseCount(next)).toBe(0);
    expect(claimAutoReplace(next)).toBe(false);
  });
});
