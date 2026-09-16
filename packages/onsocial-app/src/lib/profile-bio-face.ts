/**
 * Face bio budget — character-first.
 * ~160 chars ≈ four wrapped lines at the face measure (20rem).
 * Line count is only a soft Enter ceiling so the field cannot tower.
 */
export const PROFILE_BIO_FACE_LINES = 4;

/** App editor cap — paragraphs, marks, and lists on About; chain stores a string. */
export const PROFILE_BIO_MAX = 2000;

export const PROFILE_BIO_LIMIT_WARN = 1900;

/**
 * Primary face budget. Sample that fits:
 * “I’m an entrepreneur, builder and lifelong learner focused on creating
 * technology that brings people together and turns ideas into meaningful action.”
 * (~148 chars)
 */
export const FACE_BIO_WRAP_CHARS = 160;

/** Show the face counter from here (field enforces the hard cap). */
export const FACE_BIO_LIMIT_WARN = 130;

/**
 * Invisible boundary used by legacy single-string joins (`profile/bio` only).
 * New writes use separate `profile/bio` + `profile/about` keys.
 */
export const PROFILE_BIO_FACE_ABOUT_MARK = '\u2063';

function normalizeBioNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/**
 * Collapse Word/Docs paste gaps. Keeps a single blank line max; drops leading
 * blanks so the face field does not open as empty space.
 * Paste-only — never run on every keystroke (that fights TipTap).
 */
export function collapseProfileBioBlankLines(text: string): string {
  const normalized = normalizeBioNewlines(text);
  const endsWithBreak = /\n$/.test(normalized);
  const collapsed = normalized.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
  if (!collapsed) return endsWithBreak ? '\n' : '';
  return endsWithBreak && !collapsed.endsWith('\n')
    ? `${collapsed}\n`
    : collapsed;
}

/** Split bio on stored newlines. Trailing blank lines stay so clamp stays honest. */
export function profileBioLines(text: string): string[] {
  return normalizeBioNewlines(text).split('\n');
}

/** Face slice — first `maxLines` lines, trailing blanks trimmed. */
export function profileBioFace(
  text: string,
  maxLines = PROFILE_BIO_FACE_LINES
): string {
  const { face } = splitProfileBioFaceAbout(text, maxLines);
  return face.trimEnd();
}

/** Clamp editor input to the face line budget (keeps mid-bio blank lines). */
export function clampProfileBioFaceLines(
  text: string,
  maxLines = PROFILE_BIO_FACE_LINES
): string {
  return profileBioLines(text).slice(0, maxLines).join('\n');
}

/**
 * Split at a wrap-char budget (newlines count like spaces).
 * Prefers a sentence end in the second half of the budget, then a word break,
 * so the face does not stop mid-sentence (“protect those…”).
 */
export function splitBioAtWrapBudget(
  text: string,
  wrapChars = FACE_BIO_WRAP_CHARS
): { head: string; tail: string } {
  const normalized = normalizeBioNewlines(text);
  if (!normalized) return { head: '', tail: '' };

  let counted = 0;
  let cutIndex = normalized.length;
  for (let i = 0; i < normalized.length; i++) {
    counted += 1;
    if (counted > wrapChars) {
      cutIndex = i;
      break;
    }
  }
  if (cutIndex >= normalized.length) {
    return { head: normalized, tail: '' };
  }

  const minBreak = Math.floor(wrapChars * 0.5);
  const sentenceBreak = findSentenceBreakBefore(normalized, minBreak, cutIndex);
  const breakAt =
    sentenceBreak ?? findWordBreakBefore(normalized, minBreak, cutIndex);

  return {
    head: normalized.slice(0, breakAt).replace(/\s+$/g, ''),
    tail: normalized.slice(breakAt).replace(/^\s+/g, ''),
  };
}

/** Index just after the last sentence-ending mark in `[from, to)`. */
function findSentenceBreakBefore(
  text: string,
  from: number,
  to: number
): number | null {
  let best: number | null = null;
  for (let i = from; i < to; i++) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…') continue;
    const prev = text[i - 1];
    const next = text[i + 1];
    // Keep decimals like 2.5 together.
    if (prev && /\d/.test(prev) && next && /\d/.test(next)) continue;
    let end = i + 1;
    while (end < to && /["'")\]]/.test(text[end]!)) end += 1;
    if (end < to && !/\s/.test(text[end]!)) continue;
    best = end;
  }
  return best;
}

function findWordBreakBefore(text: string, from: number, to: number): number {
  for (let i = to; i >= from; i--) {
    if (/\s/.test(text[i]!)) return i;
  }
  return to;
}

function faceFlatLength(text: string): number {
  return text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().length;
}

/**
 * Face field input — keep the face budget in the face field only.
 * Does not move overflow into About (About is edited separately).
 * Must not rewrite in-budget text — TipTap will reset and eat keystrokes.
 */
export function clampFaceEditorInput(
  next: string,
  opts?: {
    maxLines?: number;
    wrapChars?: number;
  }
): string {
  const maxLines = opts?.maxLines ?? PROFILE_BIO_FACE_LINES;
  const wrapChars = opts?.wrapChars ?? FACE_BIO_WRAP_CHARS;
  const normalized = normalizeBioNewlines(next);
  const lines = profileBioLines(normalized);
  const flatLen = faceFlatLength(normalized);

  if (flatLen <= wrapChars && lines.length <= maxLines) {
    return normalized;
  }

  if (flatLen > wrapChars) {
    return splitBioAtWrapBudget(normalized, wrapChars).head;
  }
  return lines.slice(0, maxLines).join('\n');
}

/**
 * @deprecated Face and About are separate keys — do not spill face overflow
 * into About. Prefer `clampFaceEditorInput` for the face field.
 */
export function partitionFaceAboutInput(
  next: string,
  existingAbout: string,
  opts?: {
    maxLines?: number;
    wrapChars?: number;
    maxTotal?: number;
  }
): { face: string; about: string; spilled: boolean } {
  const prior = normalizeBioNewlines(existingAbout)
    .replace(/^\n+/, '')
    .replace(/\n+$/g, '');
  const face = clampFaceEditorInput(next, opts);
  const spilled = face !== normalizeBioNewlines(next);
  return { face, about: prior, spilled };
}

/** Legacy padded joins (`face\n\n\n\nabout`) and classic four-line cuts. */
function splitLegacyProfileBioFaceAbout(
  text: string,
  maxLines: number
): { face: string; about: string } {
  const lines = profileBioLines(text);

  // Previous padFaceLinesForJoin shape: one content line + blank pads + about.
  if (
    lines.length > maxLines &&
    Boolean(lines[0]?.trim()) &&
    lines.slice(1, maxLines).every((line) => !line.trim())
  ) {
    return {
      face: lines[0] ?? '',
      about: lines.slice(maxLines).join('\n'),
    };
  }

  if (lines.length <= maxLines) {
    if (faceFlatLength(text) > FACE_BIO_WRAP_CHARS) {
      const split = splitBioAtWrapBudget(text);
      return { face: split.head, about: split.tail };
    }
    return {
      face: lines.join('\n').replace(/\n+$/g, ''),
      about: '',
    };
  }

  return {
    face: lines.slice(0, maxLines).join('\n').replace(/\n+$/g, ''),
    about: lines.slice(maxLines).join('\n'),
  };
}

/** Split a legacy joined bio into face lines vs About continuation. */
export function splitProfileBioFaceAbout(
  text: string,
  maxLines = PROFILE_BIO_FACE_LINES
): { face: string; about: string } {
  const normalized = normalizeBioNewlines(text);
  const mark = PROFILE_BIO_FACE_ABOUT_MARK;
  const markAt = normalized.indexOf(mark);
  if (markAt !== -1) {
    return {
      face: normalized.slice(0, markAt).replace(/\n+$/g, ''),
      about: normalized.slice(markAt + mark.length).replace(/^\n+/, ''),
    };
  }
  return splitLegacyProfileBioFaceAbout(normalized, maxLines);
}

/**
 * Soft-read face + About from split keys (or legacy joined `profile/bio`).
 * When `about` already has content, trust split storage; otherwise peel a
 * joined bio so the next save can write both keys cleanly.
 */
export function resolveStoredProfileFaceAbout(
  bio?: string | null,
  about?: string | null
): { face: string; about: string } {
  const bioText = bio ?? '';
  const aboutText = about ?? '';
  if (aboutText.trim()) {
    if (bioText.includes(PROFILE_BIO_FACE_ABOUT_MARK)) {
      return {
        face: splitProfileBioFaceAbout(bioText).face,
        about: aboutText,
      };
    }
    return { face: bioText, about: aboutText };
  }
  return splitProfileBioFaceAbout(bioText);
}

export function clampProfileBioFace(face: string): string {
  const normalized = normalizeBioNewlines(face).replace(/\n+$/g, '');
  if (!normalized) return '';
  if (
    faceFlatLength(normalized) <= FACE_BIO_WRAP_CHARS &&
    profileBioLines(normalized).length <= PROFILE_BIO_FACE_LINES
  ) {
    return normalized;
  }
  if (faceFlatLength(normalized) > FACE_BIO_WRAP_CHARS) {
    return splitBioAtWrapBudget(normalized).head;
  }
  return clampProfileBioFaceLines(normalized).replace(/\n+$/g, '');
}

/**
 * Clip a DAO purpose to the face wrap budget. The tail is leftover copy for
 * the full-bio drawer — never an About page essay.
 */
export function partitionDaoPurposeFaceAbout(purpose: string): {
  face: string;
  about: string;
} {
  const normalized = normalizeBioNewlines(purpose).trim();
  if (!normalized) return { face: '', about: '' };
  const { head, tail } = splitBioAtWrapBudget(normalized);
  return { face: head.trim(), about: tail.trim() };
}

/** Face shows an ellipsis + drawer when full purpose/bio is longer than the lede. */
export function daoFaceBioOverflows(full: string, face: string): boolean {
  const fullText = normalizeBioNewlines(full).trim();
  const faceText = normalizeBioNewlines(face).trim();
  if (!fullText) return false;
  return fullText !== faceText;
}

/**
 * True when `profile/about` is the leftover tail of Sputnik purpose — an earlier
 * import wrote remainder into About. Hide it so About stays a page.
 */
export function isLegacyDaoPurposeRemainder(opts: {
  about?: string | null;
  purpose?: string | null;
}): boolean {
  const about = normalizeBioNewlines(opts.about ?? '').trim();
  const purpose = normalizeBioNewlines(opts.purpose ?? '').trim();
  if (!about || !purpose) return false;
  const remainder = partitionDaoPurposeFaceAbout(purpose).about;
  if (remainder.length > 0 && remainder === about) return true;
  const peeled = purpose.split('\n').slice(PROFILE_BIO_FACE_LINES).join('\n').trim();
  return peeled.length > 0 && peeled === about;
}

/** @deprecated Prefer separate `profile/bio` + `profile/about` writes. */
export function joinProfileBioFaceAbout(face: string, about: string): string {
  const facePart = clampProfileBioFace(face);
  const aboutPart = normalizeBioNewlines(about)
    .replace(/^\n+/, '')
    .replace(/\n+$/g, '');
  if (!aboutPart.trim()) return facePart;
  if (!facePart) return `${PROFILE_BIO_FACE_ABOUT_MARK}\n${aboutPart}`;
  return `${facePart}\n${PROFILE_BIO_FACE_ABOUT_MARK}\n${aboutPart}`;
}

export function profileBioHasLineOverflow(
  text: string,
  maxLines = PROFILE_BIO_FACE_LINES
): boolean {
  return profileBioLines(text.trimEnd()).length > maxLines;
}

/**
 * Face link / editor hint — About room is set.
 * Face bio is its own capped field and never opens About. Overflow / same-string
 * compares were for the joined `profile/bio` era.
 */
export function profileAboutHasMoreThanFace(opts: {
  aboutText?: string | null;
  /** Quiet About lead above the film. */
  leadText?: string | null;
  photoCount?: number;
  /** Topics live in About — open About when any are set. */
  tagCount?: number;
}): boolean {
  if ((opts.photoCount ?? 0) > 0) return true;
  if ((opts.tagCount ?? 0) > 0) return true;
  if (opts.leadText?.trim()) return true;
  return Boolean(opts.aboutText?.trim());
}

/** About-page meta — published face + More essay. Purpose is not About. */
export function resolvePortfolioAboutBio(opts: {
  shellBio?: string | null;
  shellAbout?: string | null;
  daoDescription?: string | null;
  daoAbout?: string | null;
  daoPurpose?: string | null;
}): string | null {
  const purpose = opts.daoPurpose?.trim() || '';
  const storedAbout = (opts.shellAbout ?? opts.daoAbout)?.trim() || '';
  const more = isLegacyDaoPurposeRemainder({ about: storedAbout, purpose })
    ? ''
    : storedAbout;
  const { face } = resolveStoredProfileFaceAbout(
    opts.shellBio ?? opts.daoDescription,
    more || null
  );
  const essay = [face, more]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n');
  if (essay) return essay;
  return purpose || null;
}

/** Real print only — empty / initials plates stay on the face. */
export function portfolioAboutPrintUrl(
  avatarUrl?: string | null
): string | null {
  const url = avatarUrl?.trim() ?? '';
  return url || null;
}
