import { cardDividerListItem } from '@/components/ui/card-divider';

/** Row shell without list-level hover — inner links carry their own affordance. */
export const profileListResultRowShellClass =
  'flex w-full min-w-0 items-start gap-3 rounded-xl px-2.5 py-2.5 text-left';

/** Shared list row styling for discover, standings, and endorsements. */
export const profileListResultRowClass = `${profileListResultRowShellClass} transition-colors hover:bg-[var(--portal-neutral-bg)] focus-within:bg-[var(--portal-neutral-bg)]`;

export const profileListResultSkeletonRowClass =
  'flex items-center gap-3 rounded-xl px-2.5 py-2.5';

/** Portal item-tier dividers between profile list rows (page + modal). */
export const profileListContainerClass = `divide-y ${cardDividerListItem}`;

/** Truncated bio in discover / standing / search lists — same tone as profile page. */
export const profileListBioClass =
  'mt-0.5 block truncate portal-type-body-sm leading-relaxed text-muted-foreground';
