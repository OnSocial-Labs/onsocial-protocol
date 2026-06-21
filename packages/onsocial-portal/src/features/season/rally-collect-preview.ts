import type { SeasonZeroLifecyclePhase } from '@/features/season/season-zero-types';

export type RallyCollectZonePreview = 'button' | 'collected';

/** Skeleton + loaded collect zone preview — phase and claim aware. */
export function resolveRallyCollectZonePreview({
  phase,
  claimClaimed,
}: {
  phase: SeasonZeroLifecyclePhase | null;
  /** null = claim not loaded yet */
  claimClaimed?: boolean | null;
}): RallyCollectZonePreview {
  if (phase !== 'claim_open') {
    return 'collected';
  }

  if (claimClaimed === false) {
    return 'button';
  }

  return 'collected';
}
