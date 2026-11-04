import { afterEach, describe, expect, it } from 'vitest';
import {
  decideSheetFocusCapture,
  decideSheetFocusRelease,
  noteHandoffProvider,
  readHandoffRestoreTarget,
  releaseHandoffProvider,
  resetHandoffFocusState,
  resolveHandoffPresentation,
  sheetHandoffFocusActive,
  stashHandoffRestoreTarget,
} from './sheet-handoff.js';

const opener = { id: 'opener' } as HTMLElement;
const connected = () => true;

describe('resolveHandoffPresentation', () => {
  it('leaves enter alone on handoff — drawers keep the slide', () => {
    expect(resolveHandoffPresentation('enter', true)).toBe('enter');
  });

  it('leaves appear and swap alone', () => {
    expect(resolveHandoffPresentation('appear', true)).toBe('appear');
    expect(resolveHandoffPresentation('swap', true)).toBe('swap');
  });

  it('keeps the enter slide when nothing is handing off', () => {
    expect(resolveHandoffPresentation('enter', false)).toBe('enter');
  });
});

describe('sheet handoff focus', () => {
  afterEach(() => {
    resetHandoffFocusState();
  });

  it('stashes the opener when the outgoing sheet unmounts during a replace', () => {
    const id = Symbol('handoff');
    noteHandoffProvider(id, true);
    const decision = decideSheetFocusRelease({
      handoffActive: sheetHandoffFocusActive(),
      panelConnected: false,
      restoreTarget: opener,
    });
    expect(decision.focusTarget).toBeNull();
    stashHandoffRestoreTarget(decision.stashTarget);
    expect(readHandoffRestoreTarget(connected)).toBe(opener);
    expect(decideSheetFocusCapture(opener, null)).toBe(opener);
  });

  it('still focuses the opener when the sheet closes in place', () => {
    noteHandoffProvider(Symbol('handoff'), true);
    expect(
      decideSheetFocusRelease({
        handoffActive: true,
        panelConnected: true,
        restoreTarget: opener,
      })
    ).toEqual({ focusTarget: opener, stashTarget: null });
  });

  it('focuses the opener on a normal dismiss', () => {
    expect(
      decideSheetFocusRelease({
        handoffActive: false,
        panelConnected: false,
        restoreTarget: opener,
      })
    ).toEqual({ focusTarget: opener, stashTarget: null });
  });

  it('drops a stashed opener once the replace is over', () => {
    const id = Symbol('handoff');
    noteHandoffProvider(id, true);
    stashHandoffRestoreTarget(opener);
    releaseHandoffProvider(id);
    expect(sheetHandoffFocusActive()).toBe(false);
    expect(readHandoffRestoreTarget(connected)).toBeNull();
  });

  it('keeps the opener while another handoff provider is still active', () => {
    const first = Symbol('first');
    const second = Symbol('second');
    noteHandoffProvider(first, true);
    noteHandoffProvider(second, true);
    stashHandoffRestoreTarget(opener);
    releaseHandoffProvider(first);
    expect(sheetHandoffFocusActive()).toBe(true);
    expect(readHandoffRestoreTarget(connected)).toBe(opener);
  });

  it('ignores a stashed opener that is no longer in the page', () => {
    noteHandoffProvider(Symbol('handoff'), true);
    stashHandoffRestoreTarget(opener);
    expect(readHandoffRestoreTarget(() => false)).toBeNull();
  });
});
