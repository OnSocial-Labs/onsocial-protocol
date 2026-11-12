'use client';

import type { PointerEvent } from 'react';

/**
 * A hug drawer is already on the visible screen. Focusing its field with
 * the browser's default scroll pans the page, and undoing that scroll after
 * paint bounces the drawer. preventScroll stops the first jump. A later
 * caret or paste pan is not written back as a top offset.
 */
export function focusFieldStill(event: PointerEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (document.activeElement === input) return;
  if (event.pointerType === 'mouse') event.preventDefault();
  input.focus({ preventScroll: true });
}
