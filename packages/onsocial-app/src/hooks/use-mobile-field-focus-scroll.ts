'use client';

import { useCallback, type FocusEventHandler } from 'react';

const MOBILE_MAX_WIDTH_PX = 767;
const KEYBOARD_SCROLL_RETRY_MS = 280;

/** Nearest overflow scroller that actually moves (composer sheet body, etc.). */
export function nearestScrollContainer(
  element: HTMLElement | null
): HTMLElement | null {
  if (!element || typeof window === 'undefined') return null;
  let node: HTMLElement | null = element.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    if (
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * After a growing textarea paints, keep the caret above the sticky compose
 * chrome. Uses a mirror measure so mid-document edits stay in view too.
 */
export function estimateTextareaCaretOffsetTop(
  element: HTMLTextAreaElement
): number | null {
  if (typeof document === 'undefined') return null;
  const style = window.getComputedStyle(element);
  const mirror = document.createElement('div');
  const marker = document.createElement('span');
  const copy = [
    'boxSizing',
    'width',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'fontStretch',
    'fontSize',
    'fontFamily',
    'lineHeight',
    'letterSpacing',
    'textTransform',
    'textAlign',
    'whiteSpace',
    'wordSpacing',
    'wordBreak',
    'overflowWrap',
  ] as const;
  mirror.setAttribute('aria-hidden', 'true');
  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    top: '0',
    left: '-9999px',
    height: 'auto',
    overflow: 'hidden',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
  });
  for (const key of copy) {
    mirror.style[key] = style[key];
  }
  const before = element.value.slice(0, element.selectionStart ?? 0);
  mirror.textContent = before;
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  mirror.remove();
  return top;
}

export function keepComposerCaretVisible(
  element: HTMLTextAreaElement | HTMLInputElement | null
) {
  if (
    !element ||
    typeof window === 'undefined' ||
    typeof document === 'undefined'
  ) {
    return;
  }
  if (document.activeElement !== element) return;

  const scroller = nearestScrollContainer(element);
  const run = () => {
    if (document.activeElement !== element) return;
    const fieldRect = element.getBoundingClientRect();
    let caretBottom = fieldRect.bottom;
    if (element.tagName === 'TEXTAREA') {
      const caretTop = estimateTextareaCaretOffsetTop(
        element as HTMLTextAreaElement
      );
      if (caretTop != null) {
        const lineHeight =
          parseFloat(window.getComputedStyle(element).lineHeight) || 22;
        caretBottom =
          fieldRect.top + (caretTop - element.scrollTop) + lineHeight;
      }
    }
    if (!scroller) {
      if (caretBottom > window.innerHeight - 96) {
        element.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
      return;
    }
    const scrollerRect = scroller.getBoundingClientRect();
    const pad = 12;
    const bottomLimit = scrollerRect.bottom - pad;
    const topLimit = scrollerRect.top + pad;
    if (caretBottom > bottomLimit) {
      scroller.scrollTop += caretBottom - bottomLimit;
      return;
    }
    if (caretBottom - 22 < topLimit) {
      scroller.scrollTop -= topLimit - (caretBottom - 22);
    }
  };

  window.requestAnimationFrame(run);
}

export function scrollMobileFieldIntoView(element: HTMLElement | null) {
  if (!element || typeof window === 'undefined') {
    return;
  }

  if (!window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches) {
    return;
  }

  const run = () => {
    const viewport = window.visualViewport;
    if (!viewport) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    const rect = element.getBoundingClientRect();
    const topInset = viewport.offsetTop + 72;
    const bottomInset = viewport.offsetTop + viewport.height - 96;

    if (rect.top < topInset || rect.bottom > bottomInset) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  window.requestAnimationFrame(run);
  window.setTimeout(run, KEYBOARD_SCROLL_RETRY_MS);
}

/** Focus a compose field and scroll it above the mobile keyboard. */
export function focusComposerField(
  field: HTMLTextAreaElement | HTMLInputElement | null
) {
  if (!field) return;
  field.focus();
  const end = field.value.length;
  try {
    field.setSelectionRange(end, end);
  } catch {
    /* Some fields reject setSelectionRange. */
  }
  scrollMobileFieldIntoView(field);
}

/**
 * Beat activation from a child field's onFocus must not force title/textarea
 * focus — that steals from article body, poll options, and place. Only muted
 * beat clicks (no focused child) should force the primary field.
 */
export function shouldForceComposerPrimaryFocus(
  options?: { focusPrimary?: boolean }
): boolean {
  return Boolean(options?.focusPrimary);
}

export function useMobileFieldFocusScroll<
  T extends HTMLElement = HTMLElement,
>(): FocusEventHandler<T> {
  return useCallback((event) => {
    scrollMobileFieldIntoView(event.currentTarget);
  }, []);
}
