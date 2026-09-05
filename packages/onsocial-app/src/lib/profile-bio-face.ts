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
  const collapsed = normalized
    .replace(/^\n+/, '')
    .replace(/\n{3,}/g, '\n\n');
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
 * Split at a wrap-char budget (newlines count like spaces). Prefers a word break
 * in the second half of the budget so face does not end mid-word.
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
  let breakAt = cutIndex;
  for (let i = cutIndex; i >= minBreak; i--) {
    if (/\s/.test(normalized[i]!)) {
      breakAt = i;
      break;
    }
  }

  return {
    head: normalized.slice(0, breakAt).replace(/\s+$/g, ''),
    tail: normalized.slice(breakAt).replace(/^\s+/g, ''),
  };
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

/** Full About body for meta — face + continuation, then dao fallbacks. */
export function resolvePortfolioAboutBio(opts: {
  shellBio?: string | null;
  shellAbout?: string | null;
  daoDescription?: string | null;
  daoPurpose?: string | null;
}): string | null {
  const { face, about } = resolveStoredProfileFaceAbout(
    opts.shellBio,
    opts.shellAbout
  );
  const essay = [face, about]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n');
  return (
    essay ||
    opts.daoDescription?.trim() ||
    opts.daoPurpose?.trim() ||
    null
  );
}

/** Real print only — empty / initials plates stay on the face. */
export function portfolioAboutPrintUrl(
  avatarUrl?: string | null
): string | null {
  const url = avatarUrl?.trim() ?? '';
  return url || null;
}
