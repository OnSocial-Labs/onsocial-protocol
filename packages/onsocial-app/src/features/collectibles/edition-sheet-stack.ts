import { SHEET_Z } from '@/lib/sheet-z';

/**
 * Listed-copy Transfer from the owner menu.
 * A grouped vault row opens the copy list. A copy already inside that list
 * leaves the list open and opens the transfer sheet over it.
 */
export function runListedCopyTransfer(input: {
  openPicker: (() => void) | null;
  onTransfer: () => void;
}): void {
  if (input.openPicker) {
    input.openPicker();
    return;
  }
  input.onTransfer();
}

/**
 * Sell and transfer keep an open copy list up and draw above it.
 * With no list up, the sheet stays on the gesture band.
 */
export function sheetZIndexOverCopyList(editionListOpen: boolean): number {
  return editionListOpen ? SHEET_Z.nested : SHEET_Z.gesture;
}
