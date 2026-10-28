import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  it('swaps a default enter when one sheet replaces another', () => {
    expect(resolveHandoffPresentation('enter', true)).toBe('swap');
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

describe('sheet handoff crossfade', () => {
  it('fades opacity only and does not move the sheet', () => {
    const cssPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../glass-sheet.css'
    );
    const css = readFileSync(cssPath, 'utf8');
    const keyframes = css.slice(
      css.indexOf('@keyframes glass-sheet-crossfade'),
      css.indexOf('.glass-sheet-panel.is-open.glass-sheet-panel--enter')
    );
    expect(keyframes).toContain('opacity: 0.72');
    expect(keyframes).toContain('opacity: 1');
    expect(keyframes).not.toContain('transform');
    expect(css).toContain(".glass-sheet-panel[data-crossfade='true'].is-open");
  });
});
