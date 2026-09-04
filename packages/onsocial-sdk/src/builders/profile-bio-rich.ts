/** Bio marks: `**bold**`, `*italic*`, `# heading`, `• list`. `#near` stays a hashtag. */

import { OS_RICH_CHIP_ATTR } from './rich-text-chips.js';

export type ProfileBioMarkRange = {
  wrapStart: number;
  innerStart: number;
  innerEnd: number;
  wrapEnd: number;
};

export type ProfileBioMarkRun = {
  kind: 'plain' | 'mark' | 'bold' | 'italic';
  value: string;
};

export type ProfileBioBoldRange = ProfileBioMarkRange;
export type ProfileBioBoldRun = {
  kind: 'plain' | 'bold' | 'mark';
  value: string;
};
export type ProfileBioItalicRange = ProfileBioMarkRange;
export type ProfileBioItalicRun = {
  kind: 'plain' | 'italic' | 'mark';
  value: string;
};

export type ProfileAboutBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] };

export type ProfileBioInlineRun = {
  bold: boolean;
  italic: boolean;
  value: string;
};

export const PROFILE_BIO_LIST_PREFIX = '• ';

const BOLD_TOKEN = '**';
const ITALIC_TOKEN = '*';
const BOLD_PAIR = /\*\*((?:(?!\*\*).)+?)\*\*/g;
const ITALIC_PAIR = /(?<!\*)\*((?:(?!\*).)+?)\*(?!\*)/g;
const HEADING_LINE_RE = /^#\s+\S/;
const LIST_LINE_RE = /^[-•]\s+/;
const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

export function stripProfileBioListPrefix(line: string): string {
  return line.replace(LIST_LINE_RE, '').trimEnd();
}

export function profileBioWordBounds(
  text: string,
  index: number
): { start: number; end: number } {
  const caret = clampIndex(text, index);
  let start = caret;
  let end = caret;
  while (start > 0 && WORD_CHAR_RE.test(text[start - 1] ?? '')) {
    start -= 1;
  }
  while (end < text.length && WORD_CHAR_RE.test(text[end] ?? '')) {
    end += 1;
  }
  return { start, end };
}

export function profileBioMarkRanges(
  text: string,
  pair: RegExp,
  tokenLength: number
): ProfileBioMarkRange[] {
  const ranges: ProfileBioMarkRange[] = [];
  const re = new RegExp(pair.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const inner = match[1] ?? '';
    ranges.push({
      wrapStart: match.index,
      innerStart: match.index + tokenLength,
      innerEnd: match.index + tokenLength + inner.length,
      wrapEnd: match.index + match[0].length,
    });
  }
  return ranges;
}

export function profileBioBoldRanges(text: string): ProfileBioBoldRange[] {
  return profileBioMarkRanges(text, BOLD_PAIR, BOLD_TOKEN.length);
}

export function profileBioItalicRanges(text: string): ProfileBioItalicRange[] {
  return profileBioMarkRanges(text, ITALIC_PAIR, ITALIC_TOKEN.length);
}

function isRangeInsideMark(
  ranges: ProfileBioMarkRange[],
  start: number,
  end: number
): boolean {
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  return ranges.some(
    (range) => from >= range.innerStart && to <= range.innerEnd
  );
}

export function isProfileBioRangeBold(
  text: string,
  start: number,
  end: number
): boolean {
  return isRangeInsideMark(profileBioBoldRanges(text), start, end);
}

export function isProfileBioRangeItalic(
  text: string,
  start: number,
  end: number
): boolean {
  return isRangeInsideMark(profileBioItalicRanges(text), start, end);
}

function splitMarkEditorRuns(
  text: string,
  pair: RegExp,
  token: string,
  markedKind: 'bold' | 'italic'
): ProfileBioMarkRun[] {
  if (!text) return [];
  const runs: ProfileBioMarkRun[] = [];
  const re = new RegExp(pair.source, 'g');
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) {
      runs.push({ kind: 'plain', value: text.slice(last, match.index) });
    }
    runs.push({ kind: 'mark', value: token });
    runs.push({ kind: markedKind, value: match[1] ?? '' });
    runs.push({ kind: 'mark', value: token });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    runs.push({ kind: 'plain', value: text.slice(last) });
  }
  return runs;
}

export function splitProfileBioBoldEditorRuns(
  text: string
): ProfileBioBoldRun[] {
  return splitMarkEditorRuns(
    text,
    BOLD_PAIR,
    BOLD_TOKEN,
    'bold'
  ) as ProfileBioBoldRun[];
}

export function splitProfileBioItalicEditorRuns(
  text: string
): ProfileBioItalicRun[] {
  return splitMarkEditorRuns(
    text,
    ITALIC_PAIR,
    ITALIC_TOKEN,
    'italic'
  ) as ProfileBioItalicRun[];
}

export function splitProfileBioBoldDisplayRuns(
  text: string
): Array<{ bold: boolean; value: string }> {
  return splitProfileBioBoldEditorRuns(text)
    .filter((run) => run.kind !== 'mark')
    .map((run) => ({ bold: run.kind === 'bold', value: run.value }));
}

export function splitProfileBioItalicDisplayRuns(
  text: string
): Array<{ italic: boolean; value: string }> {
  return splitProfileBioItalicEditorRuns(text)
    .filter((run) => run.kind !== 'mark')
    .map((run) => ({ italic: run.kind === 'italic', value: run.value }));
}

export function splitProfileBioInlineDisplayRuns(
  text: string
): ProfileBioInlineRun[] {
  const runs: ProfileBioInlineRun[] = [];
  for (const boldRun of splitProfileBioBoldDisplayRuns(text)) {
    for (const italicRun of splitProfileBioItalicDisplayRuns(boldRun.value)) {
      runs.push({
        bold: boldRun.bold,
        italic: italicRun.italic,
        value: italicRun.value,
      });
    }
  }
  return runs;
}

function toggleProfileBioMark(
  text: string,
  start: number,
  end: number,
  opts: {
    token: string;
    ranges: (value: string) => ProfileBioMarkRange[];
    maxLength: number;
  }
): { text: string; start: number; end: number } {
  const from = clampIndex(text, Math.min(start, end));
  const to = clampIndex(text, Math.max(start, end));
  const covering = opts
    .ranges(text)
    .find((range) => from >= range.wrapStart && to <= range.wrapEnd);

  if (covering) {
    const inner = text.slice(covering.innerStart, covering.innerEnd);
    const next =
      text.slice(0, covering.wrapStart) + inner + text.slice(covering.wrapEnd);
    const tokenLength = opts.token.length;
    const shift = (index: number) => {
      if (index <= covering.wrapStart) return index;
      if (index <= covering.innerStart) return covering.wrapStart;
      if (index <= covering.innerEnd) return index - tokenLength;
      return covering.wrapStart + inner.length;
    };
    return { text: next, start: shift(from), end: shift(to) };
  }

  if (from === to) {
    const word = profileBioWordBounds(text, from);
    if (word.start === word.end) {
      return { text, start: from, end: to };
    }
    return toggleProfileBioMark(text, word.start, word.end, opts);
  }

  const selected = text.slice(from, to);
  const token = opts.token;
  if (
    selected.startsWith(token) &&
    selected.endsWith(token) &&
    selected.length > token.length * 2
  ) {
    const inner = selected.slice(token.length, selected.length - token.length);
    return {
      text: text.slice(0, from) + inner + text.slice(to),
      start: from,
      end: from + inner.length,
    };
  }

  if (text.length + token.length * 2 > opts.maxLength) {
    return { text, start: from, end: to };
  }

  return {
    text: `${text.slice(0, from)}${token}${selected}${token}${text.slice(to)}`,
    start: from + token.length,
    end: to + token.length,
  };
}

export function toggleProfileBioBold(
  text: string,
  start: number,
  end: number,
  maxLength = Number.POSITIVE_INFINITY
): { text: string; start: number; end: number } {
  return toggleProfileBioMark(text, start, end, {
    token: BOLD_TOKEN,
    ranges: profileBioBoldRanges,
    maxLength,
  });
}

export function toggleProfileBioItalic(
  text: string,
  start: number,
  end: number,
  maxLength = Number.POSITIVE_INFINITY
): { text: string; start: number; end: number } {
  return toggleProfileBioMark(text, start, end, {
    token: ITALIC_TOKEN,
    ranges: profileBioItalicRanges,
    maxLength,
  });
}

export function isProfileBioHeadingLine(line: string): boolean {
  return HEADING_LINE_RE.test(line);
}

export function isProfileBioListLine(line: string): boolean {
  return LIST_LINE_RE.test(line);
}

/** `#near` / a lone `#` — Discover tags, not headings. */
export function isProfileBioHashtagLine(line: string): boolean {
  return line.startsWith('#') && !isProfileBioHeadingLine(line);
}

export function isProfileBioRangeHeading(
  text: string,
  start: number,
  end: number
): boolean {
  const spans = profileBioLineSpansTouching(text, start, end);
  return (
    spans.length > 0 &&
    spans.every((span) =>
      isProfileBioHeadingLine(text.slice(span.start, span.end))
    )
  );
}

export function isProfileBioRangeList(
  text: string,
  start: number,
  end: number
): boolean {
  const spans = profileBioLineSpansTouching(text, start, end);
  return (
    spans.length > 0 &&
    spans.every((span) =>
      isProfileBioListLine(text.slice(span.start, span.end))
    )
  );
}

export function toggleProfileBioHeading(
  text: string,
  start: number,
  end: number,
  maxLength = Number.POSITIVE_INFINITY
): { text: string; start: number; end: number } {
  return toggleProfileBioLinePrefix(text, start, end, {
    isPrefixed: isProfileBioHeadingLine,
    prefix: '# ',
    skip: isProfileBioHashtagLine,
    maxLength,
  });
}

export function toggleProfileBioList(
  text: string,
  start: number,
  end: number,
  maxLength = Number.POSITIVE_INFINITY
): { text: string; start: number; end: number } {
  return toggleProfileBioLinePrefix(text, start, end, {
    isPrefixed: isProfileBioListLine,
    prefix: PROFILE_BIO_LIST_PREFIX,
    maxLength,
  });
}

/**
 * About / face blocks — `# Title` is a heading, `• item` / `- item` is a list,
 * `#near` stays prose. Blank lines separate paragraphs; a heading or list
 * also breaks the block.
 */
export function profileAboutBlocks(text: string): ProfileAboutBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ProfileAboutBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (isProfileBioHeadingLine(line)) {
      blocks.push({
        type: 'heading',
        text: line.replace(/^#\s+/, '').trimEnd(),
      });
      index += 1;
      continue;
    }

    if (isProfileBioListLine(line)) {
      const items: string[] = [];
      while (index < lines.length && isProfileBioListLine(lines[index] ?? '')) {
        items.push(stripProfileBioListPrefix(lines[index] ?? ''));
        index += 1;
      }
      const kept = items.filter((item) => item.trim());
      if (kept.length > 0) {
        blocks.push({ type: 'list', items: kept });
      }
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? '').trim() &&
      !isProfileBioHeadingLine(lines[index] ?? '') &&
      !isProfileBioListLine(lines[index] ?? '')
    ) {
      paragraph.push(lines[index] ?? '');
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
  }

  return blocks;
}

/** One-line preview — marks stripped. Optional `maxBlocks` keeps list teasers short. */
export function profileBioPlainPreview(
  text: string,
  opts?: { maxBlocks?: number }
): string {
  const blocks = profileAboutBlocks(text);
  const limited =
    opts?.maxBlocks != null && opts.maxBlocks > 0
      ? blocks.slice(0, opts.maxBlocks)
      : blocks;
  const parts: string[] = [];
  for (const block of limited) {
    if (block.type === 'list') {
      for (const item of block.items) {
        parts.push(
          splitProfileBioInlineDisplayRuns(item)
            .map((run) => run.value)
            .join('')
        );
      }
      continue;
    }
    parts.push(
      splitProfileBioInlineDisplayRuns(block.text)
        .map((run) => run.value)
        .join('')
    );
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Enter on a list line continues `• ` under it; Enter on an empty bullet
 * exits the list.
 */
export function continueProfileBioListOnEnter(
  text: string,
  start: number,
  end: number,
  maxLength = Number.POSITIVE_INFINITY
): { text: string; start: number; end: number } | null {
  const from = clampIndex(text, Math.min(start, end));
  const to = clampIndex(text, Math.max(start, end));
  const lineStart = text.lastIndexOf('\n', from - 1) + 1;
  const lineBreak = text.indexOf('\n', from);
  const lineEnd = lineBreak === -1 ? text.length : lineBreak;
  if (to > lineEnd) return null;
  const line = text.slice(lineStart, lineEnd);
  if (!isProfileBioListLine(line)) return null;

  const body = stripProfileBioListPrefix(line);
  if (!body.trim()) {
    const next = `${text.slice(0, lineStart)}${text.slice(lineEnd + (lineBreak === -1 ? 0 : 1))}`;
    const caret = Math.min(lineStart, next.length);
    return { text: next, start: caret, end: caret };
  }

  const insert = `\n${PROFILE_BIO_LIST_PREFIX}`;
  if (text.length - (to - from) + insert.length > maxLength) {
    return null;
  }
  const next = `${text.slice(0, from)}${insert}${text.slice(to)}`;
  const caret = from + insert.length;
  return { text: next, start: caret, end: caret };
}

export function profileBioLineSpansTouching(
  text: string,
  start: number,
  end: number
): Array<{ start: number; end: number }> {
  const from = clampIndex(text, Math.min(start, end));
  const to = clampIndex(text, Math.max(start, end));
  const spans: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  while (cursor <= text.length) {
    const next = text.indexOf('\n', cursor);
    const lineEnd = next === -1 ? text.length : next;
    if (from <= lineEnd && to >= cursor) {
      spans.push({ start: cursor, end: lineEnd });
    }
    if (next === -1) break;
    cursor = next + 1;
  }

  return spans;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineRunsToHtml(text: string): string {
  return splitProfileBioInlineDisplayRuns(text)
    .map((run) => {
      let html = escapeHtml(run.value);
      if (run.italic) html = `<em>${html}</em>`;
      if (run.bold) html = `<strong>${html}</strong>`;
      return html;
    })
    .join('');
}

/** Markdown → contenteditable HTML (no caret gaps from invisible marks). */
export function profileBioMarkdownToHtml(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.trim()) return '<p><br></p>';

  const endsWithBreak = /\n$/.test(normalized);
  const blocks = profileAboutBlocks(normalized);
  if (blocks.length === 0) return '<p><br></p>';

  const html = blocks
    .map((block) => {
      if (block.type === 'heading') {
        return `<h3>${inlineRunsToHtml(block.text)}</h3>`;
      }
      if (block.type === 'list') {
        const items = block.items
          .map((item) => `<li>${inlineRunsToHtml(item)}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      }
      return block.text
        .split('\n')
        .map((line) =>
          line.trim() ? `<p>${inlineRunsToHtml(line)}</p>` : '<p><br></p>'
        )
        .join('');
    })
    .join('');

  // Trailing Enter is stored as a final `\n` — restore an empty block for the caret.
  return endsWithBreak ? `${html}<p><br></p>` : html;
}

function elementInlineStyle(el: Element): string {
  if (typeof el.getAttribute !== 'function') return '';
  return (el.getAttribute('style') || '').toLowerCase();
}

function elementLooksBold(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'strong' || tag === 'b') return true;
  const style = elementInlineStyle(el);
  if (/font-weight\s*:\s*(bold|[6-9]00)/.test(style)) return true;
  return false;
}

function elementLooksItalic(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'em' || tag === 'i') return true;
  const style = elementInlineStyle(el);
  return /font-style\s*:\s*italic/.test(style);
}

function wrapMarkdownMark(text: string, mark: '**' | '*'): string {
  if (!text) return '';
  const lead = text.match(/^\s*/)?.[0] ?? '';
  const trail = text.match(/\s*$/)?.[0] ?? '';
  const core = text.slice(lead.length, text.length - trail.length);
  if (!core) return text;
  return `${lead}${mark}${core}${mark}${trail}`;
}

function inlineNodesToMarkdown(nodes: ArrayLike<ChildNode>): string {
  let out = '';
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (!node) continue;
    if (node.nodeType === TEXT_NODE) {
      out += node.textContent ?? '';
      continue;
    }
    if (node.nodeType !== ELEMENT_NODE) continue;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') {
      out += '\n';
      continue;
    }
    // Live editor chip spans — plain token text only (no bold/italic from the chip).
    if (
      typeof el.hasAttribute === 'function' &&
      el.hasAttribute(OS_RICH_CHIP_ATTR)
    ) {
      out += inlineNodesToMarkdown(el.childNodes);
      continue;
    }
    const inner = inlineNodesToMarkdown(el.childNodes);
    if (elementLooksBold(el) && elementLooksItalic(el)) {
      out += wrapMarkdownMark(wrapMarkdownMark(inner, '*'), '**');
      continue;
    }
    if (elementLooksBold(el)) {
      out += wrapMarkdownMark(inner, '**');
      continue;
    }
    if (elementLooksItalic(el)) {
      out += wrapMarkdownMark(inner, '*');
      continue;
    }
    out += inner;
  }
  return out;
}

function pushMarkdownBlock(blocks: string[], text: string) {
  // Keep trailing `\n` from `<br>` so Enter survives the HTML → md → HTML loop.
  const cleaned = text.replace(/\u00a0/g, ' ').replace(/[ \t]+$/g, '');
  if (!cleaned.replace(/\n/g, '').trim()) return;
  blocks.push(cleaned);
}

/** Contenteditable HTML → profile bio markdown. */
export function profileBioHtmlToMarkdown(root: ParentNode): string {
  const blocks: string[] = [];

  for (let i = 0; i < root.childNodes.length; i += 1) {
    const node = root.childNodes[i];
    if (!node) continue;

    if (node.nodeType === TEXT_NODE) {
      pushMarkdownBlock(blocks, node.textContent ?? '');
      continue;
    }
    if (node.nodeType !== ELEMENT_NODE) continue;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === 'ul' || tag === 'ol') {
      const lines: string[] = [];
      for (let j = 0; j < el.children.length; j += 1) {
        const child = el.children[j];
        if (!child || child.tagName.toLowerCase() !== 'li') continue;
        const item = inlineNodesToMarkdown(child.childNodes).trim();
        if (item) lines.push(`${PROFILE_BIO_LIST_PREFIX}${item}`);
      }
      if (lines.length > 0) pushMarkdownBlock(blocks, lines.join('\n'));
      continue;
    }

    if (/^h[1-4]$/.test(tag)) {
      const text = inlineNodesToMarkdown(el.childNodes).trim();
      if (text) pushMarkdownBlock(blocks, `# ${text}`);
      continue;
    }

    if (tag === 'p' || tag === 'div') {
      const nestedList = Array.from(el.children).find((child) => {
        const nestedTag = child.tagName.toLowerCase();
        return nestedTag === 'ul' || nestedTag === 'ol';
      });
      if (nestedList && el.children.length === 1) {
        const nestedBlocks: string[] = [];
        profileBioHtmlToMarkdown(el)
          .split(/\n\n+/)
          .forEach((part) => pushMarkdownBlock(nestedBlocks, part));
        for (const part of nestedBlocks) pushMarkdownBlock(blocks, part);
        continue;
      }
      const text = inlineNodesToMarkdown(el.childNodes);
      if (!text.replace(/\n/g, '').trim()) {
        // Empty block from Enter (`<p><br></p>` / `<div><br></div>`).
        blocks.push('');
        continue;
      }
      pushMarkdownBlock(blocks, text);
      continue;
    }

    if (tag === 'br') {
      blocks.push('');
      continue;
    }

    const text = inlineNodesToMarkdown(el.childNodes).trim();
    if (text) pushMarkdownBlock(blocks, text);
  }

  // Single `\n` so each contenteditable block maps to one face line (Enter),
  // not a double-spaced paragraph gap that blows the 4-line face budget.
  return blocks.join('\n');
}

function toggleProfileBioLinePrefix(
  text: string,
  start: number,
  end: number,
  opts: {
    isPrefixed: (line: string) => boolean;
    prefix: string;
    skip?: (line: string) => boolean;
    maxLength: number;
  }
): { text: string; start: number; end: number } {
  const from = clampIndex(text, Math.min(start, end));
  const to = clampIndex(text, Math.max(start, end));
  const spans = profileBioLineSpansTouching(text, from, to);
  if (spans.length === 0) {
    return { text, start: from, end: to };
  }

  const writable = spans.filter((span) => {
    const line = text.slice(span.start, span.end);
    return !opts.skip?.(line);
  });
  if (writable.length === 0) {
    return { text, start: from, end: to };
  }

  const allPrefixed = writable.every((span) =>
    opts.isPrefixed(text.slice(span.start, span.end))
  );
  const prefixLength = opts.prefix.length;

  if (!allPrefixed) {
    const needed =
      writable.filter(
        (span) => !opts.isPrefixed(text.slice(span.start, span.end))
      ).length * prefixLength;
    if (text.length + needed > opts.maxLength) {
      return { text, start: from, end: to };
    }
  }

  let next = text;
  let startShift = 0;
  let endShift = 0;

  for (const span of [...writable].reverse()) {
    const line = next.slice(span.start, span.end);
    if (allPrefixed) {
      const unwrapped = unwrapLinePrefix(line, opts.prefix);
      next = next.slice(0, span.start) + unwrapped + next.slice(span.end);
      const delta = unwrapped.length - line.length;
      if (from >= span.end) startShift += delta;
      else if (from > span.start) {
        startShift += Math.max(delta, span.start - from);
      }
      if (to >= span.end) endShift += delta;
      else if (to > span.start) {
        endShift += Math.max(delta, span.start - to);
      }
      continue;
    }

    if (opts.isPrefixed(line)) continue;
    next =
      next.slice(0, span.start) + opts.prefix + line + next.slice(span.end);
    if (from >= span.start) startShift += prefixLength;
    if (to >= span.start) endShift += prefixLength;
  }

  return {
    text: next,
    start: from + startShift,
    end: to + endShift,
  };
}

function unwrapLinePrefix(line: string, prefix: string): string {
  if (line.startsWith(prefix)) return line.slice(prefix.length);
  if (prefix === '# ' && /^#\s+/.test(line)) {
    return line.replace(/^#\s+/, '');
  }
  if (
    (prefix === PROFILE_BIO_LIST_PREFIX || prefix === '- ') &&
    LIST_LINE_RE.test(line)
  ) {
    return stripProfileBioListPrefix(line);
  }
  return line;
}

function clampIndex(text: string, index: number): number {
  return Math.max(0, Math.min(index, text.length));
}
