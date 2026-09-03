/** Bio marks: `**bold**`, `*italic*`, `# heading`, `- list`. `#near` stays a hashtag. */

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

const BOLD_TOKEN = '**';
const ITALIC_TOKEN = '*';
const BOLD_PAIR = /\*\*((?:(?!\*\*).)+?)\*\*/g;
const ITALIC_PAIR = /(?<!\*)\*((?:(?!\*).)+?)\*(?!\*)/g;
const HEADING_LINE_RE = /^#\s+\S/;
const LIST_LINE_RE = /^-\s+/;
const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;

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
  return ranges.some((range) => from >= range.innerStart && to <= range.innerEnd);
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
  return splitMarkEditorRuns(text, BOLD_PAIR, BOLD_TOKEN, 'bold') as ProfileBioBoldRun[];
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
  const covering = opts.ranges(text).find(
    (range) => from >= range.wrapStart && to <= range.wrapEnd
  );

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
    prefix: '- ',
    maxLength,
  });
}

/**
 * About / face blocks — `# Title` is a heading, `- item` is a list,
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
