/**
 * Scroll offset that parks a field at the top of a sheet body.
 * The body is the band between the drawer header and the action button.
 */
export function sheetBodyScrollTopForField(
  bodyRectTop: number,
  bodyScrollTop: number,
  fieldRectTop: number,
  padPx = 6
): number {
  return Math.max(0, fieldRectTop - bodyRectTop + bodyScrollTop - padPx);
}

/** Park the field at the top of the keyboard-open gesture sheet body. */
export function alignSheetFieldToBodyTop(field: HTMLElement, padPx = 6): void {
  const body = field.closest('.glass-sheet-body');
  if (!(body instanceof HTMLElement)) return;
  const panel = field.closest('.os-gesture-sheet-panel');
  if (!panel?.classList.contains('is-keyboard-open')) return;
  const top = sheetBodyScrollTopForField(
    body.getBoundingClientRect().top,
    body.scrollTop,
    field.getBoundingClientRect().top,
    padPx
  );
  if (Math.abs(body.scrollTop - top) < 1) return;
  body.scrollTo({ top, behavior: 'auto' });
}
