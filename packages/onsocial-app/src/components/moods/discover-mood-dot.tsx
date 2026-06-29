import type { CSSProperties } from 'react';
import type { PageMoodId } from '@onsocial/sdk';
import { moodDiscoverHintVars } from '@/lib/moods/resolve';

interface DiscoverMoodDotProps {
  moodId: PageMoodId;
}

/** Accent-only mood hint for discover / list rows — not a full mood atmosphere. */
export function DiscoverMoodDot({ moodId }: DiscoverMoodDotProps) {
  return (
    <span
      className="discover-mood-hint"
      data-mood={moodId}
      style={moodDiscoverHintVars(moodId) as CSSProperties}
      aria-hidden="true"
    >
      <span className="discover-mood-dot" />
    </span>
  );
}
