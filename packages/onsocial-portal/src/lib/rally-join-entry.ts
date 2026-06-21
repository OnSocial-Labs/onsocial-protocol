import type { SeasonZeroLifecyclePhase } from '@/features/season/season-zero-types';

export function shouldUseHistoricalRallyJoinEntry(
  phase: SeasonZeroLifecyclePhase | null | undefined
): boolean {
  return phase != null && phase !== 'upcoming' && phase !== 'live';
}

export function resolveRallyHeroJoinEntryLabel({
  phase,
  seasonJoinEntryYocto = null,
  currentJoinEntryLabel = null,
  formatYocto,
}: {
  phase: SeasonZeroLifecyclePhase | null | undefined;
  seasonJoinEntryYocto?: string | null;
  currentJoinEntryLabel?: string | null;
  formatYocto: (yocto: string) => string;
}): string | null {
  if (shouldUseHistoricalRallyJoinEntry(phase)) {
    if (!seasonJoinEntryYocto) {
      return null;
    }

    return formatYocto(seasonJoinEntryYocto);
  }

  return currentJoinEntryLabel?.trim() || null;
}
