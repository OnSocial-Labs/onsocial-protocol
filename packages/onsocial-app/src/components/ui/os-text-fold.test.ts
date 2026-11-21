// @vitest-environment jsdom
import { createElement } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OsTextFold,
  textFoldOverflows,
  textFoldPeekPx,
} from './os-text-fold';

describe('textFoldPeekPx / textFoldOverflows', () => {
  it('builds the closed peek from line height', () => {
    expect(textFoldPeekPx(20, 4)).toBe(80);
    expect(textFoldPeekPx(19.2, 6)).toBe(116);
  });

  it('treats a 1px over-peek as overflow', () => {
    expect(textFoldOverflows(80, 80)).toBe(false);
    expect(textFoldOverflows(81, 80)).toBe(false);
    expect(textFoldOverflows(82, 80)).toBe(true);
  });
});

describe('OsTextFold measure scheduling', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not remeasure when the parent redraws with the same contentKey', () => {
    const style = {
      lineHeight: '20px',
      fontSize: '14px',
    } as CSSStyleDeclaration;
    const spy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation(() => style);

    const { rerender } = render(
      createElement(
        OsTextFold,
        {
          open: false,
          closedLines: 4,
          capped: true,
          contentKey: 'same-body',
          onOverflow: () => {},
        },
        createElement('p', null, 'hello world')
      )
    );
    const afterMount = spy.mock.calls.length;
    expect(afterMount).toBeGreaterThan(0);

    rerender(
      createElement(
        OsTextFold,
        {
          open: false,
          closedLines: 4,
          capped: true,
          contentKey: 'same-body',
          // New callback identity — must not force layout.
          onOverflow: () => {},
        },
        createElement('p', null, 'hello world')
      )
    );
    expect(spy.mock.calls.length).toBe(afterMount);

    rerender(
      createElement(
        OsTextFold,
        {
          open: false,
          closedLines: 4,
          capped: true,
          contentKey: 'new-body',
          onOverflow: () => {},
        },
        createElement('p', null, 'changed copy')
      )
    );
    expect(spy.mock.calls.length).toBeGreaterThan(afterMount);
  });
});
