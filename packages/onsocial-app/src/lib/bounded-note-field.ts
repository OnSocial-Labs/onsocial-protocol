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

export function normalizeBoundedNote(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasUnsupportedBoundedNoteCharacters(value: string): boolean {
  const normalized = normalizeBoundedNote(value);
  if (!normalized) return false;
  return !BOUNDED_NOTE_ALLOWED_PATTERN.test(normalized);
}

export function getBoundedNoteError(value: string): string {
  const normalized = normalizeBoundedNote(value);
  if (!normalized) return '';
  if (hasUnsupportedBoundedNoteCharacters(value)) {
    return 'Use letters, numbers, spaces, and basic punctuation only.';
  }
  return '';
}

export function isBoundedNoteReady(
  value: string,
  limits: BoundedNoteLimits = PROPOSAL_DESCRIPTION_LIMITS
): boolean {
  const normalized = normalizeBoundedNote(value);
  const textError = getBoundedNoteError(value);
  const length = normalized.length;
  return !textError && length >= limits.min && length <= limits.max;
}

export function getBoundedNoteCounterLabel(
  length: number,
  limits: BoundedNoteLimits
): string {
  return length < limits.min
    ? `${length} / ${limits.min} min`
    : `${length} / ${limits.max}`;
}

export function getBoundedNoteCounterClass(
  length: number,
  hasInput: boolean,
  limits: BoundedNoteLimits,
  options?: { invalidCharacters?: boolean }
): string {
  if (options?.invalidCharacters) {
    return 'is-invalid-chars';
  }
  if (hasInput && length < limits.min) {
    return 'is-under-min';
  }
  if (length >= limits.warning) {
    return 'is-near-max';
  }
  return '';
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
    label: invalidCharacters ? `Invalid · ${countLabel}` : countLabel,
    className: getBoundedNoteCounterClass(length, hasInput, limits, {
      invalidCharacters,
    }),
  };
}
