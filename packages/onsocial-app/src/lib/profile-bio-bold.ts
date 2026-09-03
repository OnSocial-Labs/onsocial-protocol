/** Bio stores `**bold**`. Only B — no italic, lists, or headings. */

export type ProfileBioBoldRange = {
  wrapStart: number;
  innerStart: number;
  innerEnd: number;
  wrapEnd: number;
};

export type ProfileBioBoldRun = {
  kind: 'plain' | 'bold' | 'mark';
  value: string;
};

const BOLD_PAIR = /\*\*((?:(?!\*\*).)+?)\*\*/g;

export function profileBioBoldRanges(text: string): ProfileBioBoldRange[] {
  const ranges: ProfileBioBoldRange[] = [];
  const re = new RegExp(BOLD_PAIR.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const inner = match[1];
    ranges.push({
      wrapStart: match.index,
      innerStart: match.index + 2,
      innerEnd: match.index + 2 + inner.length,
      wrapEnd: match.index + match[0].length,
    });
  }
  return ranges;
}

export function isProfileBioRangeBold(
  text: string,
  start: number,
  end: number
): boolean {
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  return profileBioBoldRanges(text).some(
    (range) => from >= range.innerStart && to <= range.innerEnd
  );
}

/** Editor backdrop — keep `**` in the stream so the overlay stays aligned. */
export function splitProfileBioBoldEditorRuns(
  text: string
): ProfileBioBoldRun[] {
  if (!text) return [];
  const runs: ProfileBioBoldRun[] = [];
  const re = new RegExp(BOLD_PAIR.source, 'g');
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) {
      runs.push({ kind: 'plain', value: text.slice(last, match.index) });
    }
    runs.push({ kind: 'mark', value: '**' });
    runs.push({ kind: 'bold', value: match[1] });
    runs.push({ kind: 'mark', value: '**' });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    runs.push({ kind: 'plain', value: text.slice(last) });
  }
  return runs;
}

/** Public bio — hide markers, keep weight. */
export function splitProfileBioBoldDisplayRuns(
  text: string
): Array<{ bold: boolean; value: string }> {
  return splitProfileBioBoldEditorRuns(text)
    .filter((run) => run.kind !== 'mark')
    .map((run) => ({ bold: run.kind === 'bold', value: run.value }));
}

export function toggleProfileBioBold(
  text: string,
  start: number,
  end: number,
  maxLength = Number.POSITIVE_INFINITY
): { text: string; start: number; end: number } {
  const from = clampIndex(text, Math.min(start, end));
  const to = clampIndex(text, Math.max(start, end));
  const covering = profileBioBoldRanges(text).find(
    (range) => from >= range.wrapStart && to <= range.wrapEnd
  );

  if (covering) {
    const inner = text.slice(covering.innerStart, covering.innerEnd);
    const next =
      text.slice(0, covering.wrapStart) + inner + text.slice(covering.wrapEnd);
    const shift = (index: number) => {
      if (index <= covering.wrapStart) return index;
      if (index <= covering.innerStart) return covering.wrapStart;
      if (index <= covering.innerEnd) return index - 2;
      return covering.wrapStart + inner.length;
    };
    return { text: next, start: shift(from), end: shift(to) };
  }

  if (from === to) {
    if (text.length + 4 > maxLength) {
      return { text, start: from, end: to };
    }
    return {
      text: `${text.slice(0, from)}****${text.slice(to)}`,
      start: from + 2,
      end: from + 2,
    };
  }

  const selected = text.slice(from, to);
  if (
    selected.startsWith('**') &&
    selected.endsWith('**') &&
    selected.length > 4
  ) {
    const inner = selected.slice(2, -2);
    return {
      text: text.slice(0, from) + inner + text.slice(to),
      start: from,
      end: from + inner.length,
    };
  }

  if (text.length + 4 > maxLength) {
    return { text, start: from, end: to };
  }

  return {
    text: `${text.slice(0, from)}**${selected}**${text.slice(to)}`,
    start: from + 2,
    end: to + 2,
  };
}

function clampIndex(text: string, index: number): number {
  return Math.max(0, Math.min(index, text.length));
}
