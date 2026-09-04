/** Face shows the first four lines of bio. The rest lives on About. */
export const PROFILE_BIO_FACE_LINES = 4;

/** App editor cap — paragraphs, marks, and lists on About; chain stores a string. */
export const PROFILE_BIO_MAX = 2000;

export const PROFILE_BIO_LIMIT_WARN = 1900;

/** ~four wrapped lines at the face bio measure (20rem / 0.875rem). */
export const FACE_BIO_WRAP_CHARS = 160;

function normalizeBioNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n');
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
  return profileBioLines(text).slice(0, maxLines).join('\n').trimEnd();
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
 * Face field input → keep a short face; spill the rest into About.
 * Used on paste/type so long essays are not trapped on the page face.
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
  const maxLines = opts?.maxLines ?? PROFILE_BIO_FACE_LINES;
  const wrapChars = opts?.wrapChars ?? FACE_BIO_WRAP_CHARS;
  const maxTotal = opts?.maxTotal ?? PROFILE_BIO_MAX;

  const lines = profileBioLines(next);
  const normalized = normalizeBioNewlines(next);

  // Within face budget — keep the exact string so Enter trailing breaks survive.
  if (
    lines.length <= maxLines &&
    faceFlatLength(normalized) <= wrapChars
  ) {
    return {
      face: normalized,
      about: normalizeBioNewlines(existingAbout)
        .replace(/^\n+/, '')
        .replace(/\n+$/g, ''),
      spilled: false,
    };
  }

  let face = lines.slice(0, maxLines).join('\n');
  let spill = lines.slice(maxLines).join('\n');

  if (faceFlatLength(face) > wrapChars) {
    const split = splitBioAtWrapBudget(face, wrapChars);
    face = split.head;
    spill = [split.tail, spill].filter((part) => part.trim()).join('\n');
  }

  spill = spill.replace(/^\n+/, '').replace(/\n+$/g, '');
  const prior = normalizeBioNewlines(existingAbout)
    .replace(/^\n+/, '')
    .replace(/\n+$/g, '');

  let about = spill ? (prior ? `${spill}\n${prior}` : spill) : prior;

  // When overflowing into About, drop a dangling blank face line at the cut.
  if (spill.trim()) {
    face = face.replace(/\n+$/g, '');
  }

  const faceBudget = face.length + (face && about ? 1 : 0);
  const aboutMax = Math.max(0, maxTotal - faceBudget);
  if (about.length > aboutMax) {
    about = about.slice(0, aboutMax).replace(/\s+$/g, '');
  }

  return {
    face,
    about,
    spilled: Boolean(spill.trim()),
  };
}

/** Split stored bio into face lines vs About continuation for the editor. */
export function splitProfileBioFaceAbout(
  text: string,
  maxLines = PROFILE_BIO_FACE_LINES
): { face: string; about: string } {
  const lines = profileBioLines(text);
  return {
    face: lines.slice(0, maxLines).join('\n'),
    about: lines.slice(maxLines).join('\n'),
  };
}

/** Join face + About continuation back into one stored bio string. */
export function joinProfileBioFaceAbout(face: string, about: string): string {
  const facePart = clampProfileBioFaceLines(face).replace(/\n+$/g, '');
  const aboutPart = normalizeBioNewlines(about).replace(/^\n+/, '');
  if (!aboutPart.trim()) return facePart;
  if (!facePart) return aboutPart.replace(/\n+$/g, '');
  return `${facePart}\n${aboutPart.replace(/\n+$/g, '')}`;
}

export function profileBioHasLineOverflow(
  text: string,
  maxLines = PROFILE_BIO_FACE_LINES
): boolean {
  return profileBioLines(text.trimEnd()).length > maxLines;
}

export function profileBioLikelyWrapsPastFace(text: string): boolean {
  const face = profileBioFace(text);
  if (!face) return false;
  if (profileBioHasLineOverflow(text)) return true;
  return faceFlatLength(face) > FACE_BIO_WRAP_CHARS;
}

/**
 * About has more than the face shows: a longer bio, a tagline hiding bio,
 * or more than four stored lines.
 */
export function profileAboutHasMoreThanFace(opts: {
  faceText?: string | null;
  aboutText?: string | null;
  photoCount?: number;
  /** Topics live in About — open About when any are set. */
  tagCount?: number;
}): boolean {
  if ((opts.photoCount ?? 0) > 0) return true;
  if ((opts.tagCount ?? 0) > 0) return true;

  const about = opts.aboutText?.trim() ?? '';
  if (!about) return false;

  const face = opts.faceText?.trim() ?? '';
  if (!face) return true;
  if (about !== face) return true;
  return profileBioLikelyWrapsPastFace(about);
}

/** Full About body — never `page/main` tagline. */
export function resolvePortfolioAboutBio(opts: {
  shellBio?: string | null;
  daoDescription?: string | null;
  daoPurpose?: string | null;
}): string | null {
  return (
    opts.shellBio?.trim() ||
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
