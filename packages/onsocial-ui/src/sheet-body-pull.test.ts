import { describe, expect, it } from 'vitest';
import {
  sheetBodyPullAllowed,
  sheetBodyPullDirection,
  sheetPressActivatesClick,
  sheetPullFromPanelBlocked,
} from './sheet-body-pull.js';

describe('sheetBodyPullAllowed', () => {
  it('allows a downward pull when every scroller is at the top', () => {
    expect(
      sheetBodyPullAllowed({
        keyboardOpen: false,
        inField: false,
        textSelected: false,
        scrollTops: [0, 0],
      })
    ).toBe(true);
  });

  it('waits while a nested list is still scrolled', () => {
    expect(
      sheetBodyPullAllowed({
        keyboardOpen: false,
        inField: false,
        textSelected: false,
        scrollTops: [0, 40],
      })
    ).toBe(false);
  });

  it('leaves the grip in charge while the keyboard is up or a field owns the finger', () => {
    expect(
      sheetBodyPullAllowed({
        keyboardOpen: true,
        inField: false,
        textSelected: false,
        scrollTops: [0],
      })
    ).toBe(false);
    expect(
      sheetBodyPullAllowed({
        keyboardOpen: false,
        inField: true,
        textSelected: false,
        scrollTops: [0],
      })
    ).toBe(false);
    expect(
      sheetBodyPullAllowed({
        keyboardOpen: false,
        inField: false,
        textSelected: true,
        scrollTops: [0],
      })
    ).toBe(false);
  });
});

describe('sheetPullFromPanelBlocked', () => {
  it('lets the header pull when the body is at the top', () => {
    expect(
      sheetPullFromPanelBlocked({
        keyboardOpen: false,
        inField: false,
        onGrip: false,
        ancestorTops: [],
        sheetBodyTop: 0,
      })
    ).toBe(false);
  });

  it('waits when the body is still scrolled, and leaves the grip alone', () => {
    expect(
      sheetPullFromPanelBlocked({
        keyboardOpen: false,
        inField: false,
        onGrip: false,
        ancestorTops: [],
        sheetBodyTop: 32,
      })
    ).toBe(true);
    expect(
      sheetPullFromPanelBlocked({
        keyboardOpen: false,
        inField: false,
        onGrip: true,
        ancestorTops: [0],
        sheetBodyTop: 0,
      })
    ).toBe(true);
  });
});

describe('sheetPressActivatesClick', () => {
  it('activates a short press that stayed still', () => {
    expect(sheetPressActivatesClick({ phase: 'pending' })).toBe(true);
  });

  it('activates a slow or shaky press, and skips only a confirmed pull', () => {
    expect(sheetPressActivatesClick({ phase: 'pull' })).toBe(false);
    expect(sheetPressActivatesClick({ phase: 'abort' })).toBe(true);
    expect(sheetPressActivatesClick({ phase: 'pending' })).toBe(true);
  });
});

describe('sheetBodyPullDirection', () => {
  it('keeps a short move as a tap', () => {
    expect(sheetBodyPullDirection(1, 2)).toBe('pending');
  });

  it('pulls only when the finger moves down', () => {
    expect(sheetBodyPullDirection(2, 12)).toBe('pull');
    expect(sheetBodyPullDirection(0, -12)).toBe('abort');
    expect(sheetBodyPullDirection(20, 6)).toBe('abort');
  });
});
