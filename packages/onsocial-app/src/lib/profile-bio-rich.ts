/** Bio marks: `**bold**`, `*italic*`, `# heading`, `- list`. `#near` stays a hashtag. */

import { splitProfileBioBoldDisplayRuns } from '@/lib/profile-bio-bold';

export type ProfileBioItalicRange = {
  wrapStart: number;
  innerStart: number;
  innerEnd: number;
  wrapEnd: number;
};

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

const ITALIC_PAIR = /(?<!\*)\*((?:(?!\*).)+?)\*(?!\*)/g;
const HEADING_LINE_RE = /^#\s+\S/;
const LIST_LINE_RE = /^-\s+/;

export function profileBioItalicRanges(text: string): ProfileBioItalicRange[] {
  const ranges: ProfileBioItalicRange[] = [];
  const re = new RegExp(ITALIC_PAIR.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const inner = match[1];
    ranges.push({
      wrapStart: match.index,
      innerStart: match.index + 1,
      innerEnd: match.index + 1 + inner.length,
      wrapEnd: match.index + match[0].length,
    });
  }
  return ranges;
}

export function isProfileBioRangeItalic(
  text: string,
  start: number,
  end: number
): boolean {
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  return profileBioItalicRanges(text).some(
    (range) => from >= range.innerStart && to <= range.innerEnd
  );
}

/** Editor backdrop — keep `*` in the stream so the overlay stays aligned. */
export function splitProfileBioItalicEditorRuns(
  text: string
): ProfileBioItalicRun[] {
  if (!text) return [];
  const runs: ProfileBioItalicRun[] = [];
  const re = new RegExp(ITALIC_PAIR.source, 'g');
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) {
      runs.push({ kind: 'plain', value: text.slice(last, match.index) });
    }
    runs.push({ kind: 'mark', value: '*' });
    runs.push({ kind: 'italic', value: match[1] });
    runs.push({ kind: 'mark', value: '*' });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    runs.push({ kind: 'plain', value: text.slice(last) });
  }
  return runs;
}

export function splitProfileBioItalicDisplayRuns(
  text: string
): Array<{ italic: boolean; value: string }> {
  return splitProfileBioItalicEditorRuns(text)
    .filter((run) => run.kind !== 'mark')
    .map((run) => ({ italic: run.kind === 'italic', value: run.value }));
}

/** Public bio — hide markers, keep weight and slant. */
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

export function toggleProfileBioItalic(
  text: string,
  start: number,
  end: number,
  maxLength = Number.POSITIVE_INFINITY
): { text: string; start: number; end: number } {
  const from = clampIndex(text, Math.min(start, end));
  const to = clampIndex(text, Math.max(start, end));
  const covering = profileBioItalicRanges(text).find(
    (range) => from >= range.wrapStart && to <= range.wrapEnd
  );

  if (covering) {
    const inner = text.slice(covering.innerStart, covering.innerEnd);
    const next =
      text.slice(0, covering.wrapStart) + inner + text.slice(covering.wrapEnd);
    const shift = (index: number) => {
      if (index <= covering.wrapStart) return index;
      if (index <= covering.innerStart) return covering.wrapStart;
      if (index <= covering.innerEnd) return index - 1;
      return covering.wrapStart + inner.length;
    };
    return { text: next, start: shift(from), end: shift(to) };
  }

  if (from === to) {
    if (text.length + 2 > maxLength) {
      return { text, start: from, end: to };
    }
    return {
      text: `${text.slice(0, from)}**${text.slice(to)}`,
      start: from + 1,
      end: from + 1,
    };
  }

  const selected = text.slice(from, to);
  if (
    selected.startsWith('*') &&
    selected.endsWith('*') &&
    selected.length > 2 &&
    !selected.startsWith('**')
  ) {
    const inner = selected.slice(1, -1);
    return {
      text: text.slice(0, from) + inner + text.slice(to),
      start: from,
      end: from + inner.length,
    };
  }

  if (text.length + 2 > maxLength) {
    return { text, start: from, end: to };
  }

  return {
    text: `${text.slice(0, from)}*${selected}*${text.slice(to)}`,
    start: from + 1,
    end: to + 1,
  };
}

export function isProfileBioHeadingLine(line: string): boolean {
  return HEADING_LINE_RE.test(line);
}

export function isProfileBioListLine(line: string): boolean {
  return LIST_LINE_RE.test(line);
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
    spans.every((span) => isProfileBioListLine(text.slice(span.start, span.end)))
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
    prefix: '- ',
    maxLength,
  });
}

/**
 * About blocks — `# Title` is a heading, `- item` is a list, `#near` stays prose.
 * Blank lines separate paragraphs; a heading or list also breaks the block.
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
        items.push((lines[index] ?? '').replace(/^-\s+/, '').trimEnd());
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

function toggleProfileBioLinePrefix(
  text: string,
  start: number,
  end: number,
  opts: {
    isPrefixed: (line: string) => boolean;
    prefix: string;
    maxLength: number;
  }
): { text: string; start: number; end: number } {
  const from = clampIndex(text, Math.min(start, end));
  const to = clampIndex(text, Math.max(start, end));
  const spans = profileBioLineSpansTouching(text, from, to);
  if (spans.length === 0) {
    return { text, start: from, end: to };
  }

  const allPrefixed = spans.every((span) =>
    opts.isPrefixed(text.slice(span.start, span.end))
  );
  const prefixLength = opts.prefix.length;

  if (!allPrefixed) {
    const needed =
      spans.filter((span) => !opts.isPrefixed(text.slice(span.start, span.end)))
        .length * prefixLength;
    if (text.length + needed > opts.maxLength) {
      return { text, start: from, end: to };
    }
  }

  let next = text;
  let startShift = 0;
  let endShift = 0;

  for (const span of [...spans].reverse()) {
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
    next = next.slice(0, span.start) + opts.prefix + line + next.slice(span.end);
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
  if (prefix === '- ' && /^-\s+/.test(line)) {
    return line.replace(/^-\s+/, '');
  }
  return line;
}

function clampIndex(text: string, index: number): number {
  return Math.max(0, Math.min(index, text.length));
}
