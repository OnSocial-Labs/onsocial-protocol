// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSheetMounted } from './use-sheet-mounted';

describe('useSheetMounted', () => {
  it('stays unmounted until the first open', () => {
    const { result, rerender } = renderHook(
      ({ open }) => useSheetMounted(open),
      { initialProps: { open: false } }
    );
    expect(result.current).toBe(false);
    rerender({ open: false });
    expect(result.current).toBe(false);
  });

  it('mounts on first open and stays mounted after close', () => {
    const { result, rerender } = renderHook(
      ({ open }) => useSheetMounted(open),
      { initialProps: { open: false } }
    );

    act(() => {
      rerender({ open: true });
    });
    expect(result.current).toBe(true);

    act(() => {
      rerender({ open: false });
    });
    expect(result.current).toBe(true);
  });

  it('starts mounted when opened on the first render', () => {
    const { result } = renderHook(() => useSheetMounted(true));
    expect(result.current).toBe(true);
  });
});
