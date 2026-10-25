import { describe, expect, it, vi } from 'vitest';
import {
  runListedCopyTransfer,
  sellSheetZIndex,
} from '@/features/collectibles/edition-sheet-stack';
import { SHEET_Z } from '@/lib/sheet-z';

describe('edition sheet stack', () => {
  it('opens the copy list from a grouped vault row', () => {
    const openPicker = vi.fn();
    const closeList = vi.fn();
    const onTransfer = vi.fn();
    runListedCopyTransfer({ openPicker, closeList, onTransfer });
    expect(openPicker).toHaveBeenCalledOnce();
    expect(closeList).not.toHaveBeenCalled();
    expect(onTransfer).not.toHaveBeenCalled();
  });

  it('closes an open copy list before transferring a listed copy', () => {
    const closeList = vi.fn();
    const onTransfer = vi.fn();
    runListedCopyTransfer({
      openPicker: null,
      closeList,
      onTransfer,
    });
    expect(closeList).toHaveBeenCalledOnce();
    expect(onTransfer).toHaveBeenCalledOnce();
    expect(closeList.mock.invocationCallOrder[0]).toBeLessThan(
      onTransfer.mock.invocationCallOrder[0]
    );
  });

  it('leaves a single-copy transfer on the transfer sheet alone', () => {
    const onTransfer = vi.fn();
    runListedCopyTransfer({
      openPicker: null,
      closeList: null,
      onTransfer,
    });
    expect(onTransfer).toHaveBeenCalledOnce();
  });

  it('draws the sell sheet above an open copy list', () => {
    expect(sellSheetZIndex(true)).toBe(SHEET_Z.nested);
    expect(sellSheetZIndex(true)).toBeGreaterThan(SHEET_Z.list);
    expect(sellSheetZIndex(false)).toBe(SHEET_Z.gesture);
  });
});
