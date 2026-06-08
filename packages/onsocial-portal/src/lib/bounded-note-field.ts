export const BOUNDED_NOTE_ALLOWED_PATTERN = /^[A-Za-z0-9 .,'"!?:;()&/\-\n]+$/;

export type BoundedNoteLimits = {
  min: number;
  max: number;
  warning: number;
};

export const PROPOSAL_DESCRIPTION_LIMITS: BoundedNoteLimits = {
  min: 20,
  max: 280,
  warning: 240,
};

export const ENDORSEMENT_NOTE_LIMITS: BoundedNoteLimits = {
  min: 20,
  max: 240,
  warning: 220,
};

/** @deprecated Use PROPOSAL_DESCRIPTION_LIMITS.min */
export const PROPOSAL_DESCRIPTION_MIN_LEN = PROPOSAL_DESCRIPTION_LIMITS.min;
/** @deprecated Use PROPOSAL_DESCRIPTION_LIMITS.max */
export const PROPOSAL_DESCRIPTION_MAX_LEN = PROPOSAL_DESCRIPTION_LIMITS.max;
/** @deprecated Use PROPOSAL_DESCRIPTION_LIMITS.warning */
export const PROPOSAL_DESCRIPTION_WARNING_THRESHOLD =
  PROPOSAL_DESCRIPTION_LIMITS.warning;
/** @deprecated Use BOUNDED_NOTE_ALLOWED_PATTERN */
export const PROPOSAL_DESCRIPTION_ALLOWED_PATTERN =
  BOUNDED_NOTE_ALLOWED_PATTERN;

export function normalizeBoundedNote(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function getBoundedNoteError(value: string) {
  const normalized = normalizeBoundedNote(value);
  if (!normalized) {
    return '';
  }
  if (!BOUNDED_NOTE_ALLOWED_PATTERN.test(normalized)) {
    return 'Use letters, numbers, spaces, and basic punctuation only';
  }
  return '';
}

export function isBoundedNoteReady(
  value: string,
  limits: BoundedNoteLimits = PROPOSAL_DESCRIPTION_LIMITS
) {
  const normalized = normalizeBoundedNote(value);
  const textError = getBoundedNoteError(value);
  const length = normalized.length;
  return !textError && length >= limits.min && length <= limits.max;
}

export function getBoundedNoteCounterLabel(
  length: number,
  limits: BoundedNoteLimits
) {
  return length < limits.min
    ? `${length} / ${limits.min} min`
    : `${length} / ${limits.max}`;
}

export function getBoundedNoteCounterClass(
  length: number,
  hasInput: boolean,
  limits: BoundedNoteLimits
) {
  if (hasInput && length < limits.min) {
    return 'text-amber-600';
  }
  if (length >= limits.warning) {
    return 'text-amber-600';
  }
  return 'text-muted-foreground/60';
}

/** @deprecated Use normalizeBoundedNote */
export const normalizeProposalDescription = normalizeBoundedNote;
/** @deprecated Use getBoundedNoteError */
export const getProposalDescriptionError = getBoundedNoteError;
/** @deprecated Use isBoundedNoteReady */
export const isProposalDescriptionReady = (value: string) =>
  isBoundedNoteReady(value, PROPOSAL_DESCRIPTION_LIMITS);
