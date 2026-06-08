/** Row shell without list-level hover — inner links carry their own affordance. */
export const profileListResultRowShellClass =
  'flex w-full min-w-0 items-start gap-3 rounded-xl px-2.5 py-2.5 text-left';

/** Shared list row styling for discover, standings, and endorsements. */
export const profileListResultRowClass = `${profileListResultRowShellClass} transition-colors hover:bg-[var(--portal-neutral-bg)] focus-within:bg-[var(--portal-neutral-bg)]`;

export const profileListResultSkeletonRowClass =
  'flex items-center gap-3 rounded-xl px-2.5 py-2.5';
