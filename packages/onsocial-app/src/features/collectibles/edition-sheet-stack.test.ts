import { describe, expect, it, vi } from 'vitest';
import {
  runListedCopyTransfer,
  sheetZIndexOverCopyList,
} from '@/features/collectibles/edition-sheet-stack';
import { SHEET_Z } from '@/lib/sheet-z';

describe('edition sheet stack', () => {
  it('opens the copy list from a grouped vault row', () => {
    const openPicker = vi.fn();
    const onTransfer = vi.fn();
    runListedCopyTransfer({ openPicker, onTransfer });
    expect(openPicker).toHaveBeenCalledOnce();
    expect(onTransfer).not.toHaveBeenCalled();
  });

  it('leaves the copy list open when transferring a listed copy', () => {
    const onTransfer = vi.fn();
    runListedCopyTransfer({ openPicker: null, onTransfer });
    expect(onTransfer).toHaveBeenCalledOnce();
  });

  it('draws sell and transfer above an open copy list', () => {
    expect(sheetZIndexOverCopyList(true)).toBe(SHEET_Z.nested);
    expect(sheetZIndexOverCopyList(true)).toBeGreaterThan(SHEET_Z.list);
    expect(sheetZIndexOverCopyList(false)).toBe(SHEET_Z.gesture);
  });
});
