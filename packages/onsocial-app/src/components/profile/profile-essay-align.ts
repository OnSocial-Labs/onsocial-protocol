export type EssayAlign = 'left' | 'center' | 'justify';

/**
 * Pressing the alignment that is already on returns to left, so center and
 * justify untick. Left is the resting alignment.
 */
export function pressProfileEssayAlign(
  current: EssayAlign,
  option: EssayAlign
): EssayAlign {
  return current === option ? 'left' : option;
}
