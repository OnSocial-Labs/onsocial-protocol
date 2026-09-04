// ---------------------------------------------------------------------------
// builders/rich-text-chips — live # / @ / $ / URL spans for contenteditable
// ---------------------------------------------------------------------------

import { splitRichText, type RichTextSegment } from './rich-text.js';

export const OS_RICH_CHIP_ATTR = 'data-os-chip';

const ELEMENT_NODE = 1;

const CHIP_CLASS: Record<
  Exclude<RichTextSegment['type'], 'text'>,
  string
> = {
  hashtag: 'os-hashtag',
  ticker: 'os-ticker',
  mention: 'os-mention',
  url: 'os-link',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build chip HTML for a single text node’s content.
 * Plain segments are escaped; chip tokens become spans (not anchors).
 */
export function richTextSegmentsToChipHtml(text: string): string {
  return splitRichText(text)
    .map((segment) => {
      if (segment.type === 'text') {
        return escapeHtml(segment.value);
      }
      const cls = CHIP_CLASS[segment.type];
      return `<span ${OS_RICH_CHIP_ATTR}="${segment.type}" class="${cls}">${escapeHtml(segment.value)}</span>`;
    })
    .join('');
}

/** Unwrap existing chip spans to plain text nodes. */
export function unwrapRichTextChips(root: ParentNode): void {
  const chips: Element[] = [];
  if (
    typeof (root as ParentNode & { querySelectorAll?: Function })
      .querySelectorAll === 'function'
  ) {
    const found = (
      root as ParentNode & {
        querySelectorAll: (s: string) => NodeListOf<Element>;
      }
    ).querySelectorAll(`[${OS_RICH_CHIP_ATTR}]`);
    for (let i = 0; i < found.length; i += 1) {
      chips.push(found[i]!);
    }
  } else {
    collectChipElements(root, chips);
  }

  for (const chip of chips) {
    const parent = chip.parentNode;
    if (!parent) continue;
    const text = chip.textContent ?? '';
    const doc =
      typeof document !== 'undefined'
        ? document
        : chip.ownerDocument;
    if (!doc) continue;
    parent.replaceChild(doc.createTextNode(text), chip);
  }
}

function collectChipElements(root: ParentNode, out: Element[]): void {
  for (let i = 0; i < root.childNodes.length; i += 1) {
    const node = root.childNodes[i];
    if (!node || node.nodeType !== ELEMENT_NODE) continue;
    const el = node as Element;
    if (
      typeof el.hasAttribute === 'function' &&
      el.hasAttribute(OS_RICH_CHIP_ATTR)
    ) {
      out.push(el);
      continue;
    }
    collectChipElements(el, out);
  }
}

/**
 * Wrap #/@/$/url tokens in spans with data-os-chip + class.
 * Call after unwrap. Skips text already inside [data-os-chip].
 * Uses document.createElement — browser/jsdom only.
 */
export function decorateRichTextChips(root: ParentNode): void {
  if (typeof document === 'undefined') return;

  const doc = document;
  const walker = doc.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    const textNode = current as Text;
    const parent = textNode.parentElement;
    if (parent?.closest(`[${OS_RICH_CHIP_ATTR}]`)) {
      current = walker.nextNode();
      continue;
    }
    const value = textNode.data;
    if (value && splitRichText(value).some((s) => s.type !== 'text')) {
      textNodes.push(textNode);
    }
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const parent = textNode.parentNode;
    if (!parent) continue;
    const html = richTextSegmentsToChipHtml(textNode.data);
    if (!html || html === escapeHtml(textNode.data)) continue;

    const template = doc.createElement('template');
    template.innerHTML = html;
    parent.replaceChild(template.content, textNode);
  }
}

const TEXT_NODE = 3;

/** Count text chars + `<br>` (1 each) inside a node tree. */
function countCaretUnits(node: Node): number {
  if (node.nodeType === TEXT_NODE) {
    return (node as Text).data.length;
  }
  if (node.nodeType !== ELEMENT_NODE) return 0;
  const el = node as Element;
  if (el.tagName.toLowerCase() === 'br') return 1;
  let total = 0;
  for (let i = 0; i < node.childNodes.length; i += 1) {
    total += countCaretUnits(node.childNodes[i]!);
  }
  return total;
}

function caretUnitWalker(root: Node): TreeWalker | null {
  if (typeof document === 'undefined') return null;
  return document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (node.nodeType === TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
      if (
        node.nodeType === ELEMENT_NODE &&
        (node as Element).tagName.toLowerCase() === 'br'
      ) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_SKIP;
    },
  });
}

/** Character offset from root start to (node, offset) — `<br>` counts as 1. */
export function getRichTextCaretOffset(
  root: Node,
  node: Node,
  offset: number
): number {
  if (typeof document === 'undefined') return 0;
  try {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, offset);
    return countCaretUnits(range.cloneContents());
  } catch {
    return 0;
  }
}

export function getRichTextSelectionOffsets(
  root: HTMLElement
): { start: number; end: number } | null {
  if (typeof document === 'undefined') return null;
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  if (!anchor || !focus || !root.contains(anchor) || !root.contains(focus)) {
    return null;
  }
  const start = getRichTextCaretOffset(root, anchor, selection.anchorOffset);
  const end = getRichTextCaretOffset(root, focus, selection.focusOffset);
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

function findCaretPoint(
  root: HTMLElement,
  target: number
): { node: Node; offset: number } {
  const walker = caretUnitWalker(root);
  if (!walker) {
    return { node: root, offset: root.childNodes.length };
  }

  let remaining = Math.max(0, target);
  let current = walker.nextNode();
  let last: { node: Node; offset: number } | null = null;

  while (current) {
    if (current.nodeType === TEXT_NODE) {
      const text = current as Text;
      const len = text.data.length;
      last = { node: text, offset: len };
      if (remaining <= len) {
        return { node: text, offset: remaining };
      }
      remaining -= len;
      current = walker.nextNode();
      continue;
    }

    // `<br>` — one caret unit. Place after the break when remaining hits 1.
    const br = current as Element;
    const parent = br.parentNode ?? root;
    const index = Array.prototype.indexOf.call(parent.childNodes, br);
    if (remaining === 0) {
      return { node: parent, offset: Math.max(0, index) };
    }
    if (remaining === 1) {
      return { node: parent, offset: index + 1 };
    }
    remaining -= 1;
    last = { node: parent, offset: index + 1 };
    current = walker.nextNode();
  }

  return last ?? { node: root, offset: root.childNodes.length };
}

/** Restore caret to a character offset within root’s text+br stream. */
export function setRichTextCaretOffset(
  root: HTMLElement,
  offset: number
): void {
  setRichTextSelectionOffsets(root, offset, offset);
}

/** Restore a selection range (keeps bold/italic highlights selected). */
export function setRichTextSelectionOffsets(
  root: HTMLElement,
  start: number,
  end: number
): void {
  if (typeof document === 'undefined') return;
  const selection = document.getSelection();
  if (!selection) return;

  const from = findCaretPoint(root, Math.max(0, start));
  const to = findCaretPoint(root, Math.max(0, end));
  try {
    const range = document.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Dom mutated mid-restore — ignore.
  }
}
