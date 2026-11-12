export type EssayAlign = 'left' | 'center' | 'justify';

const CYCLE: readonly EssayAlign[] = ['left', 'center', 'justify'];

/** One control. Each press moves left → center → justify → left. */
export function cycleProfileEssayAlign(current: EssayAlign): EssayAlign {
  const index = CYCLE.indexOf(current);
  return CYCLE[(index + 1) % CYCLE.length] ?? 'left';
}
