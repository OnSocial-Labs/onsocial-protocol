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
    expect(result.current.mounted).toBe(false);
    rerender({ open: false });
    expect(result.current.mounted).toBe(false);
  });

  it('mounts on open and stays through close until onClosed', () => {
    const { result, rerender } = renderHook(
      ({ open }) => useSheetMounted(open),
      { initialProps: { open: false } }
    );

    act(() => {
      rerender({ open: true });
    });
    expect(result.current.mounted).toBe(true);

    act(() => {
      rerender({ open: false });
    });
    expect(result.current.mounted).toBe(true);

    act(() => {
      result.current.onClosed();
    });
    expect(result.current.mounted).toBe(false);
  });

  it('starts mounted when opened on the first render', () => {
    const { result } = renderHook(() => useSheetMounted(true));
    expect(result.current.mounted).toBe(true);
  });

  it('can open again after onClosed', () => {
    const { result, rerender } = renderHook(
      ({ open }) => useSheetMounted(open),
      { initialProps: { open: true } }
    );
    act(() => {
      rerender({ open: false });
      result.current.onClosed();
    });
    expect(result.current.mounted).toBe(false);
    act(() => {
      rerender({ open: true });
    });
    expect(result.current.mounted).toBe(true);
  });

  it('holds through open=false so the close slide can finish before onClosed', () => {
    const { result, rerender } = renderHook(
      ({ open }) => useSheetMounted(open),
      { initialProps: { open: true } }
    );
    act(() => {
      rerender({ open: false });
    });
    // Intentionally not calling onClosed yet — same contract as article /
    // medium: open flips first, leave animation owns the tree, then release.
    expect(result.current.mounted).toBe(true);
    act(() => {
      result.current.onClosed();
    });
    expect(result.current.mounted).toBe(false);
  });
});
