import { SHEET_Z } from '@/lib/sheet-z';

/**
 * Listed-copy Transfer from the owner menu.
 * A grouped vault row opens the copy list. A copy already inside that list
 * closes it first, then the transfer sheet opens, same as an unlisted copy.
 */
export function runListedCopyTransfer(input: {
  openPicker: (() => void) | null;
  closeList: (() => void) | null;
  onTransfer: () => void;
}): void {
  if (input.openPicker) {
    input.openPicker();
    return;
  }
  input.closeList?.();
  input.onTransfer();
}

/**
 * List for sale keeps the copy list open and draws the sell sheet over it.
 * With no list up, the sheet stays on the gesture band.
 */
export function sellSheetZIndex(editionListOpen: boolean): number {
  return editionListOpen ? SHEET_Z.nested : SHEET_Z.gesture;
}
