/** Governance-safe prose: accounts, role ids, arrows, middle dots, thresholds. */
export const BOUNDED_NOTE_ALLOWED_PATTERN =
  /^[A-Za-z0-9 .,'"!?:;()&/\-\n_@≥·→%+]+$/;

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

export const POLICY_PROPOSAL_DESCRIPTION_LIMITS: BoundedNoteLimits = {
  min: 10,
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

function hasUnsupportedBoundedNoteCharacters(value: string) {
  const normalized = normalizeBoundedNote(value);
  if (!normalized) {
    return false;
  }

  return !BOUNDED_NOTE_ALLOWED_PATTERN.test(normalized);
}

export const BOUNDED_NOTE_CHARACTER_ERROR =
  'Use letters, numbers, spaces, and basic punctuation only';

export const BOUNDED_NOTE_INVALID_CHARACTER_COUNTER_LABEL = 'Invalid character';

export function isBoundedNoteCharacterError(message: string): boolean {
  return message.trim() === BOUNDED_NOTE_CHARACTER_ERROR;
}

export function getBoundedNoteError(value: string) {
  const normalized = normalizeBoundedNote(value);
  if (!normalized) {
    return '';
  }
  if (hasUnsupportedBoundedNoteCharacters(value)) {
    return BOUNDED_NOTE_CHARACTER_ERROR;
  }
  return '';
}

export function resolveBoundedNoteSubmitBlocker(
  value: string,
  limits: BoundedNoteLimits = PROPOSAL_DESCRIPTION_LIMITS
): string | null {
  if (isBoundedNoteReady(value, limits)) {
    return null;
  }

  // Description feedback lives in the field counter — keep submit rows for form only.
  return null;
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

/** Endorsement note is optional when media is attached; otherwise min length applies. */
export function isEndorsementContentReady(
  value: string,
  hasMedia: boolean,
  limits: BoundedNoteLimits = ENDORSEMENT_NOTE_LIMITS
) {
  const normalized = normalizeBoundedNote(value);
  const textError = getBoundedNoteError(value);
  if (textError) return false;
  if (!normalized) return hasMedia;
  if (hasMedia) return normalized.length <= limits.max;
  return normalized.length >= limits.min && normalized.length <= limits.max;
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
  limits: BoundedNoteLimits,
  options?: { invalidCharacters?: boolean }
) {
  if (options?.invalidCharacters) {
    return 'portal-red-text';
  }

  if (hasInput && length < limits.min) {
    return 'text-amber-600';
  }
  if (length >= limits.warning) {
    return 'text-amber-600';
  }
  return 'text-muted-foreground/60';
}

export function getBoundedNoteFieldCounter(
  value: string,
  limits: BoundedNoteLimits = PROPOSAL_DESCRIPTION_LIMITS
) {
  const length = normalizeBoundedNote(value).length;
  const invalidCharacters = hasUnsupportedBoundedNoteCharacters(value);
  const hasInput = length > 0;
  const countLabel = getBoundedNoteCounterLabel(length, limits);

  return {
    length,
    invalidCharacters,
    label: invalidCharacters
      ? `${BOUNDED_NOTE_INVALID_CHARACTER_COUNTER_LABEL} · ${countLabel}`
      : countLabel,
    className: getBoundedNoteCounterClass(length, hasInput, limits, {
      invalidCharacters,
    }),
  };
}

/** @deprecated Use normalizeBoundedNote */
export const normalizeProposalDescription = normalizeBoundedNote;
/** @deprecated Use getBoundedNoteError */
export const getProposalDescriptionError = getBoundedNoteError;
/** @deprecated Use isBoundedNoteReady */
export const isProposalDescriptionReady = (value: string) =>
  isBoundedNoteReady(value, PROPOSAL_DESCRIPTION_LIMITS);
