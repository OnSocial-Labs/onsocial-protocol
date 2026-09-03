/** Face shows the first four lines of bio. The rest lives on About. */
export const PROFILE_BIO_FACE_LINES = 4;

/** App editor cap — paragraphs + `**bold**` on About; chain stores a string. */
export const PROFILE_BIO_MAX = 2000;

export const PROFILE_BIO_LIMIT_WARN = 1900;

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

export function profileBioHasLineOverflow(
  text: string,
  maxLines = PROFILE_BIO_FACE_LINES
): boolean {
  return profileBioLines(text.trimEnd()).length > maxLines;
}

/** ~four wrapped lines at the face bio measure (20rem / 0.875rem). */
const FACE_BIO_WRAP_CHARS = 160;

export function profileBioLikelyWrapsPastFace(text: string): boolean {
  const face = profileBioFace(text);
  if (!face) return false;
  if (profileBioHasLineOverflow(text)) return true;
  return face.replace(/\n/g, ' ').length > FACE_BIO_WRAP_CHARS;
}

/**
 * About has more than the face shows: a longer bio, a tagline hiding bio,
 * or more than four stored lines.
 */
export function profileAboutHasMoreThanFace(opts: {
  faceText?: string | null;
  aboutText?: string | null;
}): boolean {
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

/** About essay — blank lines become paragraphs. Single `\n` stays in the block. */
export function profileAboutEssayBlocks(text: string): string[] {
  return normalizeBioNewlines(text)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/** Real print only — empty / initials plates stay on the face. */
export function portfolioAboutPrintUrl(
  avatarUrl?: string | null
): string | null {
  const url = avatarUrl?.trim() ?? '';
  return url || null;
}
